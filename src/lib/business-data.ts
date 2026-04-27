/**
 * Unified data access layer.
 * Every AI feature calls these functions — never queries square_* or pos_* tables directly.
 * Returns normalized types regardless of whether the business uses Square or AriaPOS.
 */
import { createServerSupabaseClient } from '@/lib/supabase-server';

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
  const supabase = createServerSupabaseClient();
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
  const supabase = createServerSupabaseClient();
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

  return (data ?? []).map((r) => ({
    id: r.id,
    externalId: r.id,
    name: r.name,
    category: null,
    priceCents: Math.round((r.price ?? 0) * 100),
    costCents: Math.round((r.cost_price ?? 0) * 100),
    currentStock: r.stock_quantity ?? 0,
    reorderPoint: r.low_stock_threshold ?? 0,
    sku: r.sku ?? null,
    unit: 'unit',
    imageUrl: r.image_url ?? null,
    isActive: r.is_active ?? true,
  }));
}

export async function getBusinessSales(
  businessId: string,
  since: Date,
  source?: DataSource
): Promise<Sale[]> {
  const supabase = createServerSupabaseClient();
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
  const supabase = createServerSupabaseClient();
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
