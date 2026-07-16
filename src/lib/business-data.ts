/**
 * Unified data access layer.
 * Every AI feature calls these functions — never queries square_* or pos_* tables directly.
 * Returns normalized types regardless of whether the business uses Square or AriaPOS.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveCostBatch } from '@/lib/inventory/resolve-cost';

export type DataSource = 'square' | 'aria_pos' | 'shopfront' | 'csv_import';

export interface LineItem {
  itemId: string;
  itemName: string;
  quantity: number;
  priceCents: number;
  costCents: number;
}

export interface Item {
  id: string;
  externalId: string;
  name: string;
  category: string | null;
  priceCents: number;
  costCents: number;
  currentStock: number;
  reorderPoint: number;
  sku: string | null;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
}

export interface Sale {
  id: string;
  externalId: string;
  totalCents: number;
  taxCents: number;
  discountCents: number;
  lineItems: LineItem[];
  customerId: string | null;
  soldAt: Date;
  paymentMethod: string | null;
}

export interface Customer {
  id: string;
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  lastVisitAt: Date | null;
  visitCount: number;
  totalSpentCents: number;
  visitFrequencyDays: number | null;
  churnRisk: 'low' | 'medium' | 'high' | 'churned';
}

export async function getBusinessDataSource(businessId: string): Promise<DataSource> {
  const supabase = supabaseAdmin;
  const { data } = await supabase
    .from('businesses')
    .select('data_source')
    .eq('id', businessId)
    .single();
  return (data?.data_source as DataSource) ?? 'aria_pos';
}

export async function getBusinessItems(
  businessId: string,
  source?: DataSource
): Promise<Item[]> {
  const supabase = supabaseAdmin;
  const dataSource = source ?? (await getBusinessDataSource(businessId));

  if (dataSource === 'square') {
    const { data } = await supabase
      .from('square_items')
      .select('*')
      .eq('business_id', businessId)
      .order('name');

    return (data ?? []).map((r) => ({
      id: r.id,
      externalId: r.square_item_id,
      name: r.name,
      category: r.category ?? null,
      priceCents: r.price_cents ?? 0,
      costCents: r.cost_cents ?? 0,
      currentStock: r.current_stock ?? 0,
      reorderPoint: r.reorder_point ?? 0,
      sku: r.sku ?? null,
      unit: r.unit ?? 'unit',
      imageUrl: r.image_url ?? null,
      isActive: true,
    }));
  }

  // aria_pos (default)
  const { data } = await supabase
    .from('pos_products')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name');

  // INTEL-COMPUTE-1 — pos_products.stock_quantity/cost_price are legacy, unmaintained columns
  // (RULE 6): the real current stock lives per-outlet on pos_outlet_inventory.items_on_hand, and the
  // real cost cascade (outlet actual → last receipt → PO history → catalogue) is resolve-cost.ts's
  // resolveCostBatch — the same canonical resolver stock-value.ts's computeStockValue() already uses
  // correctly. This was the exact "parallel warehouse stack valuing stock on stale stock_quantity ×
  // cost_price" bug the audit found reimplemented at 6+ warehouse routes/pages — business-data.ts is
  // the single highest-leverage fix since every AI feature reads items through getBusinessItems().
  // stock_quantity is kept only as a last-resort fallback for businesses with no outlet-inventory
  // rows at all — a lesser-quality real source, never a fabricated one.
  const [{ data: inv }, costMap] = await Promise.all([
    supabase.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', businessId),
    resolveCostBatch(supabase, businessId, null),
  ]);
  const stockByProduct = new Map<string, number>();
  for (const row of inv ?? []) {
    const pid = row.product_id as string;
    stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + (Number(row.items_on_hand) || 0));
  }

  return (data ?? []).map((r) => {
    const resolved = costMap.get(r.id);
    const costCents = resolved?.cost != null ? Math.round(resolved.cost * 100) : Math.round((r.cost_price ?? 0) * 100);
    return {
      id: r.id,
      externalId: r.id,
      name: r.name,
      category: null,
      priceCents: Math.round((r.price ?? 0) * 100),
      costCents,
      currentStock: stockByProduct.get(r.id) ?? (r.stock_quantity ?? 0),
      reorderPoint: r.low_stock_threshold ?? 0,
      sku: r.sku ?? null,
      unit: 'unit',
      imageUrl: r.image_url ?? null,
      isActive: r.is_active ?? true,
    };
  });
}

export async function getBusinessSales(
  businessId: string,
  since: Date,
  source?: DataSource
): Promise<Sale[]> {
  const supabase = supabaseAdmin;
  const dataSource = source ?? (await getBusinessDataSource(businessId));

  if (dataSource === 'square') {
    const { data } = await supabase
      .from('square_sales')
      .select('*')
      .eq('business_id', businessId)
      .gte('sold_at', since.toISOString())
      .order('sold_at', { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
      externalId: r.square_order_id,
      totalCents: r.total_cents,
      taxCents: r.tax_cents ?? 0,
      discountCents: r.discount_cents ?? 0,
      lineItems: Array.isArray(r.line_items) ? r.line_items : [],
      customerId: r.customer_id ?? null,
      soldAt: new Date(r.sold_at),
      paymentMethod: r.payment_method ?? null,
    }));
  }

  // aria_pos
  const { data } = await supabase
    .from('pos_sales')
    .select('*, pos_sale_items(*)')
    .eq('business_id', businessId)
    .gte('created_at', since.toISOString())
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    externalId: r.sale_number ?? r.id,
    totalCents: Math.round((r.total_amount ?? 0) * 100),
    taxCents: Math.round((r.tax_amount ?? 0) * 100),
    discountCents: Math.round((r.discount_amount ?? 0) * 100),
    lineItems: (r.pos_sale_items ?? []).map((li: any) => ({
      itemId: li.product_id,
      itemName: li.product_name ?? '',
      quantity: li.quantity,
      priceCents: Math.round((li.unit_price ?? 0) * 100),
      costCents: 0,
    })),
    customerId: r.customer_id ?? null,
    soldAt: new Date(r.created_at),
    paymentMethod: r.payment_method ?? null,
  }));
}

export async function getBusinessCustomers(
  businessId: string,
  source?: DataSource
): Promise<Customer[]> {
  const supabase = supabaseAdmin;
  const dataSource = source ?? (await getBusinessDataSource(businessId));

  if (dataSource === 'square') {
    const { data } = await supabase
      .from('square_customers')
      .select('*')
      .eq('business_id', businessId)
      .order('last_visit_at', { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
      externalId: r.square_customer_id,
      name: r.name ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      lastVisitAt: r.last_visit_at ? new Date(r.last_visit_at) : null,
      visitCount: r.visit_count ?? 0,
      totalSpentCents: r.total_spent_cents ?? 0,
      visitFrequencyDays: r.visit_frequency_days ?? null,
      churnRisk: (r.churn_risk ?? 'low') as Customer['churnRisk'],
    }));
  }

  // aria_pos
  const { data } = await supabase
    .from('pos_customers')
    .select('*')
    .eq('business_id', businessId)
    .order('last_visit', { ascending: false });

  return (data ?? []).map((r) => {
    const daysSince = r.last_visit
      ? Math.floor((Date.now() - new Date(r.last_visit).getTime()) / 86400000)
      : 999;
    const churnRisk: Customer['churnRisk'] =
      daysSince > 180 ? 'churned' : daysSince > 90 ? 'high' : daysSince > 60 ? 'medium' : 'low';

    return {
      id: r.id,
      externalId: r.id,
      name: r.name ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      lastVisitAt: r.last_visit ? new Date(r.last_visit) : null,
      visitCount: r.visit_count ?? 0,
      totalSpentCents: Math.round((r.total_spent ?? 0) * 100),
      visitFrequencyDays: null,
      churnRisk,
    };
  });
}

export interface VarianceItem {
  item_id: string;
  item_name: string;
  theoretical_stock: number;
  actual_stock: number;
  variance: number;
  variance_value_cents: number;
  variance_pct: number;
}

export async function calculateVariance(
  businessId: string,
  dataSource: DataSource
): Promise<VarianceItem[]> {
  const supabase = supabaseAdmin;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [items, sales, movements] = await Promise.all([
    getBusinessItems(businessId, dataSource),
    getBusinessSales(businessId, thirtyDaysAgo, dataSource),
    supabase.from('stock_movements')
      .select('item_id, quantity_added')
      .eq('business_id', businessId)
      .eq('movement_type', 'receipt_scan')
      .gte('scanned_at', thirtyDaysAgo.toISOString()),
  ]);

  // Units received per item (last 30 days)
  const received: Record<string, number> = {};
  for (const mv of movements.data ?? []) {
    received[mv.item_id] = (received[mv.item_id] ?? 0) + mv.quantity_added;
  }

  // Units sold per item (last 30 days)
  const sold: Record<string, number> = {};
  for (const sale of sales) {
    for (const li of sale.lineItems) {
      sold[li.itemId] = (sold[li.itemId] ?? 0) + li.quantity;
    }
  }

  return items
    .map(item => {
      const recv = received[item.id] ?? 0;
      const soldQty = sold[item.id] ?? sold[item.externalId] ?? 0;
      // Derive opening stock: current + sold - received
      const openingStock = item.currentStock + soldQty - recv;
      const theoretical = openingStock + recv - soldQty;
      const variance = theoretical - item.currentStock;
      if (Math.abs(variance) < 1) return null;
      return {
        item_id: item.id,
        item_name: item.name,
        theoretical_stock: theoretical,
        actual_stock: item.currentStock,
        variance,
        variance_value_cents: Math.abs(variance) * item.costCents,
        variance_pct: theoretical > 0 ? Math.round((variance / theoretical) * 100) : 0,
      };
    })
    .filter((v): v is VarianceItem => v !== null)
    .sort((a, b) => b.variance_value_cents - a.variance_value_cents);
}
