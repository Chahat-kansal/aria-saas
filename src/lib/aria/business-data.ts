import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

type SupabaseServerClient = ReturnType<typeof createServerSupabaseClient>;
type Row = Record<string, any>;

export type AriaDataStatus = {
  has_pos_connection: boolean;
  has_sales_data: boolean;
  has_product_data: boolean;
  has_inventory_data: boolean;
  has_supplier_data: boolean;
  has_customer_data: boolean;
  has_staff_data: boolean;
  has_uploaded_data: boolean;
  has_previous_actions: boolean;
  last_sync_at: string | null;
  missing_required_data: string[];
};

export type WholesaleContext = {
  revenue_this_month: number;
  outstanding_receivables: number;
  top_customers: Array<{ customer_id: string; name: string; revenue: number }>;
  reorder_reminders: Array<{ customer_id: string; name: string; message: string }>;
};

export type AriaBusinessData = {
  business: Row | null;
  data_status: AriaDataStatus;
  sales: Row[];
  products: Row[];
  sale_items: Row[];
  inventory: Row[];
  suppliers: Row[];
  supplier_costs: Row[];
  customers: Row[];
  staff: Row[];
  imports: Row[];
  previous_actions: Row[];
  raw_counts: {
    sales: number;
    products: number;
    inventory: number;
    suppliers: number;
    customers: number;
    staff: number;
    imports: number;
    actions: number;
  };
  wholesale?: WholesaleContext;
};

const RECENT_LIMIT = 500;
const DETAIL_LIMIT = 1000;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function asArray<T = Row>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function timestampOf(row: Row) {
  return row.updated_at ?? row.created_at ?? row.sold_at ?? row.last_sync_at ?? row.last_import_at ?? null;
}

function latestTimestamp(rows: Row[]) {
  let latest: string | null = null;
  for (const row of rows) {
    const value = timestampOf(row);
    if (!value) continue;
    if (!latest || new Date(value).getTime() > new Date(latest).getTime()) latest = value;
  }
  return latest;
}

async function safeSelect(
  supabase: SupabaseServerClient,
  table: string,
  build: (query: any) => any
): Promise<Row[]> {
  try {
    const { data, error } = await build(supabase.from(table).select('*'));
    if (error) {
      console.warn(`[aria/business-data] ${table} skipped: ${error.message}`);
      return [];
    }
    return asArray(data);
  } catch (error) {
    console.warn(`[aria/business-data] ${table} unavailable`, error);
    return [];
  }
}

async function safeBusiness(supabase: SupabaseServerClient, businessId: string, userId?: string) {
  let query = supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId);

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error('[aria/business-data] business lookup failed', error.message);
    return null;
  }
  return data ?? null;
}

function uploadTypes(imports: Row[]) {
  return new Set(imports.map(file => String(file.upload_type ?? '').toLowerCase()));
}

export async function collectBusinessData(
  businessId: string,
  options: { userId?: string; supabase?: SupabaseServerClient } = {}
): Promise<AriaBusinessData> {
  const supabase = options.supabase ?? createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const business = await safeBusiness(supabase, businessId, options.userId);

  if (!business) {
    return emptyBusinessData(null);
  }

  const since90 = daysAgo(90);
  const since30 = daysAgo(30);

  const [
    squareConnections,
    squareSales,
    posSales,
    squareItems,
    posProducts,
    posSaleItems,
    stockMovements,
    warehouseLots,
    warehouseItemLocations,
    posSuppliers,
    supplierPerformance,
    purchaseOrders,
    posCustomers,
    squareCustomers,
    staffMembers,
    posStaff,
    imports,
    previousActions,
  ] = await Promise.all([
    safeSelect(db, 'square_connections', q => q.eq('business_id', businessId).limit(5)),
    safeSelect(db, 'square_sales', q => q.eq('business_id', businessId).gte('sold_at', since90).order('sold_at', { ascending: false }).limit(RECENT_LIMIT)),
    safeSelect(db, 'pos_sales', q => q.eq('business_id', businessId).gte('created_at', since90).order('created_at', { ascending: false }).limit(RECENT_LIMIT)),
    safeSelect(db, 'square_items', q => q.eq('business_id', businessId).order('name').limit(RECENT_LIMIT)),
    safeSelect(db, 'pos_products', q => q.eq('business_id', businessId).order('name').limit(RECENT_LIMIT)),
    // pos_sale_items has no business_id column — join via pos_sales
    (async (): Promise<Row[]> => {
      try {
        const { data: salesData } = await db.from('pos_sales').select('id')
          .eq('business_id', businessId).gte('created_at', since90).limit(DETAIL_LIMIT);
        const ids = (salesData ?? []).map((s: Row) => s.id as string);
        if (!ids.length) return [];
        const { data, error } = await db.from('pos_sale_items').select('*')
          .in('sale_id', ids).limit(DETAIL_LIMIT);
        if (error) { console.warn('[aria/business-data] pos_sale_items skipped:', error.message); return []; }
        return asArray(data);
      } catch (e) { console.warn('[aria/business-data] pos_sale_items unavailable', e); return []; }
    })(),
    safeSelect(db, 'stock_movements', q => q.eq('business_id', businessId).gte('scanned_at', since90).limit(DETAIL_LIMIT)),
    safeSelect(db, 'warehouse_lots', q => q.eq('business_id', businessId).limit(RECENT_LIMIT)),
    safeSelect(db, 'warehouse_item_locations', q => q.eq('business_id', businessId).limit(RECENT_LIMIT)),
    safeSelect(db, 'pos_suppliers', q => q.eq('business_id', businessId).limit(RECENT_LIMIT)),
    safeSelect(db, 'warehouse_supplier_performance', q => q.eq('business_id', businessId).gte('created_at', since90).limit(RECENT_LIMIT)),
    safeSelect(db, 'warehouse_purchase_orders', q => q.eq('business_id', businessId).gte('created_at', since90).limit(RECENT_LIMIT)),
    safeSelect(db, 'pos_customers', q => q.eq('business_id', businessId).order('last_visit', { ascending: false }).limit(RECENT_LIMIT)),
    safeSelect(db, 'square_customers', q => q.eq('business_id', businessId).limit(RECENT_LIMIT)),
    safeSelect(db, 'staff_members', q => q.eq('business_id', businessId).limit(RECENT_LIMIT)),
    safeSelect(db, 'pos_staff', q => q.eq('business_id', businessId).limit(RECENT_LIMIT)),
    safeSelect(db, 'imported_files', q => q.eq('business_id', businessId).order('created_at', { ascending: false }).limit(50)),
    safeSelect(db, 'aria_actions', q => q.eq('business_id', businessId).order('created_at', { ascending: false }).limit(100)),
  ]);

  const sales = [...squareSales, ...posSales];
  const products = [...squareItems, ...posProducts];
  const saleItems = posSaleItems;
  const inventory = [...stockMovements, ...warehouseLots, ...warehouseItemLocations];
  const suppliers = posSuppliers;
  const supplierCosts = [...supplierPerformance, ...purchaseOrders];
  const allCustomers = [...posCustomers, ...squareCustomers];
  const staff = [...staffMembers, ...posStaff];
  const importTypes = uploadTypes(imports);

  const hasUploadedData = imports.length > 0;
  const hasSalesData = sales.length > 0 || importTypes.has('sales');
  const hasProductData = products.length > 0 || importTypes.has('products');
  const hasInventoryData =
    inventory.length > 0 ||
    products.some(product => product.stock_quantity != null || product.current_stock != null || product.low_stock_threshold != null) ||
    importTypes.has('inventory');
  const hasSupplierData = suppliers.length > 0 || supplierCosts.length > 0 || importTypes.has('supplier_costs');
  const hasCustomerData = allCustomers.length > 0;
  const hasStaffData = staff.length > 0;
  const hasPosConnection = Boolean(
    squareConnections.length > 0 ||
    business.square_connected ||
    business.data_source === 'square' ||
    business.data_source === 'aria_pos'
  );

  // Only sales + products are truly required — inventory/supplier/customer are optional enrichment
  const missingRequiredData = [
    !hasSalesData ? 'sales data' : null,
    !hasProductData ? 'product catalogue' : null,
  ].filter((item): item is string => Boolean(item));

  const lastSyncAt = latestTimestamp([
    ...squareConnections,
    ...sales,
    ...products,
    ...inventory,
    ...supplierCosts,
    ...imports,
  ]);

  // Fetch wholesale context
  const wholesaleCtx = await (async (): Promise<WholesaleContext> => {
    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const since90 = daysAgo(90);

      const [monthOrders, outstandingOrders, allOrders90] = await Promise.all([
        db.from('wholesale_orders').select('total').eq('business_id', businessId)
          .in('status', ['confirmed', 'invoiced', 'sent', 'partial', 'paid'])
          .gte('created_at', monthStart),
        db.from('wholesale_orders').select('total').eq('business_id', businessId)
          .in('status', ['sent', 'partial']),
        db.from('wholesale_orders').select('customer_id, total, created_at').eq('business_id', businessId)
          .in('status', ['confirmed', 'invoiced', 'sent', 'partial', 'paid'])
          .gte('created_at', since90),
      ]);

      const revenue_this_month = (monthOrders.data ?? []).reduce((s: number, o: Row) => s + (Number(o.total) || 0), 0);
      const outstanding_receivables = (outstandingOrders.data ?? []).reduce((s: number, o: Row) => s + (Number(o.total) || 0), 0);

      // Top 3 customers by revenue in last 90d
      const custRevMap: Record<string, number> = {};
      for (const o of (allOrders90.data ?? [])) {
        if (!o.customer_id) continue;
        custRevMap[o.customer_id] = (custRevMap[o.customer_id] ?? 0) + (Number(o.total) || 0);
      }
      const topCustIds = Object.entries(custRevMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);

      let top_customers: Array<{ customer_id: string; name: string; revenue: number }> = [];
      if (topCustIds.length > 0) {
        const { data: custData } = await db.from('customers').select('id, name, business_name').in('id', topCustIds);
        top_customers = topCustIds.map(id => {
          const c = (custData ?? []).find((x: Row) => x.id === id);
          return { customer_id: id, name: (c?.business_name ?? c?.name ?? id) as string, revenue: custRevMap[id] ?? 0 };
        });
      }

      // Reorder reminders: customers with avg cycle < 30d and last order > avg ago
      const reorder_reminders: Array<{ customer_id: string; name: string; message: string }> = [];
      try {
        const { data: allCustOrders } = await db.from('wholesale_orders')
          .select('customer_id, created_at')
          .eq('business_id', businessId)
          .in('status', ['confirmed', 'invoiced', 'sent', 'partial', 'paid'])
          .order('created_at', { ascending: true });

        const custOrderDates: Record<string, string[]> = {};
        for (const o of (allCustOrders ?? [])) {
          if (!o.customer_id) continue;
          if (!custOrderDates[o.customer_id]) custOrderDates[o.customer_id] = [];
          custOrderDates[o.customer_id].push(o.created_at);
        }

        const nowMs = Date.now();
        for (const [custId, dates] of Object.entries(custOrderDates)) {
          if (dates.length < 2) continue;
          const gaps: number[] = [];
          for (let i = 1; i < dates.length; i++) {
            gaps.push(new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime());
          }
          const avgGapMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          const avgGapDays = avgGapMs / 86400000;
          if (avgGapDays >= 30) continue;

          const lastOrderMs = new Date(dates[dates.length - 1]).getTime();
          const daysSinceLast = (nowMs - lastOrderMs) / 86400000;
          if (daysSinceLast < avgGapDays) continue;

          const custInfo = top_customers.find(c => c.customer_id === custId);
          const custName = custInfo?.name ?? custId;
          reorder_reminders.push({
            customer_id: custId,
            name: custName,
            message: custName + ' is due to reorder based on their usual ' + Math.round(avgGapDays) + '-day cycle (last ordered ' + Math.round(daysSinceLast) + ' days ago)',
          });

          // Write to aria_notifications if table exists
          try {
            await db.from('aria_notifications').insert({
              type: 'wholesale_reorder_due',
              business_id: businessId,
              message: custName + ' is due to reorder based on their usual cycle',
              customer_id: custId,
            });
          } catch (e) { console.warn('[business-data] aria_notifications insert skipped:', e) }
        }
      } catch (e) { console.error('[business-data] reorder_reminders fetch failed:', e) }

      return { revenue_this_month, outstanding_receivables, top_customers, reorder_reminders };
    } catch (e) {
      console.error('[business-data] wholesale context fetch failed, returning empty:', e)
      return { revenue_this_month: 0, outstanding_receivables: 0, top_customers: [], reorder_reminders: [] };
    }
  })();

  return {
    business,
    data_status: {
      has_pos_connection: hasPosConnection,
      has_sales_data: hasSalesData,
      has_product_data: hasProductData,
      has_inventory_data: hasInventoryData,
      has_supplier_data: hasSupplierData,
      has_customer_data: hasCustomerData,
      has_staff_data: hasStaffData,
      has_uploaded_data: hasUploadedData,
      has_previous_actions: previousActions.length > 0,
      last_sync_at: lastSyncAt,
      missing_required_data: missingRequiredData,
    },
    sales,
    products,
    sale_items: saleItems,
    inventory,
    suppliers,
    supplier_costs: supplierCosts,
    customers: allCustomers,
    staff,
    imports,
    previous_actions: previousActions,
    raw_counts: {
      sales: sales.length,
      products: products.length,
      inventory: inventory.length,
      suppliers: suppliers.length + supplierCosts.length,
      customers: allCustomers.length,
      staff: staff.length,
      imports: imports.length,
      actions: previousActions.length,
    },
    wholesale: wholesaleCtx,
  };
}

export function emptyBusinessData(business: Row | null): AriaBusinessData {
  return {
    business,
    data_status: {
      has_pos_connection: false,
      has_sales_data: false,
      has_product_data: false,
      has_inventory_data: false,
      has_supplier_data: false,
      has_customer_data: false,
      has_staff_data: false,
      has_uploaded_data: false,
      has_previous_actions: false,
      last_sync_at: null,
      missing_required_data: ['sales data', 'product catalogue', 'inventory or stock levels'],
    },
    sales: [],
    products: [],
    sale_items: [],
    inventory: [],
    suppliers: [],
    supplier_costs: [],
    customers: [],
    staff: [],
    imports: [],
    previous_actions: [],
    raw_counts: {
      sales: 0,
      products: 0,
      inventory: 0,
      suppliers: 0,
      customers: 0,
      staff: 0,
      imports: 0,
      actions: 0,
    },
    wholesale: {
      revenue_this_month: 0,
      outstanding_receivables: 0,
      top_customers: [],
      reorder_reminders: [],
    },
  };
}
