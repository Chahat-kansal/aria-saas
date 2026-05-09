import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const ARIA_POS_TOOLS: Tool[] = [
  {
    name: 'query_sales',
    description: 'Fetch and group sales data from pos_sales for a date range.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'ISO date string YYYY-MM-DD' },
        date_to: { type: 'string', description: 'ISO date string YYYY-MM-DD' },
        group_by: {
          type: 'string',
          enum: ['day', 'week', 'month', 'product', 'cashier', 'payment_method'],
        },
        limit: { type: 'number' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'query_inventory',
    description: 'Fetch inventory data from pos_products. Supports low-stock and dead-stock filters.',
    input_schema: {
      type: 'object',
      properties: {
        low_stock_only: { type: 'boolean' },
        dead_stock_only: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'query_customers',
    description: 'Fetch customer data from pos_customers with optional segment, sort, and search.',
    input_schema: {
      type: 'object',
      properties: {
        segment: { type: 'string' },
        sort_by: { type: 'string', enum: ['ltv', 'recency', 'frequency'] },
        limit: { type: 'number' },
        search: { type: 'string' },
      },
    },
  },
  {
    name: 'compare_periods',
    description: 'Compare a metric across two date periods and return percent change.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['revenue', 'transactions', 'avg_order'] },
        period_a: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } },
          required: ['from', 'to'],
        },
        period_b: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } },
          required: ['from', 'to'],
        },
      },
      required: ['metric', 'period_a', 'period_b'],
    },
  },
  {
    name: 'generate_chart',
    description: 'Generate a chart specification for the visualisation canvas.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['line', 'bar', 'area', 'pie', 'stacked-bar'] },
        data: { type: 'array', items: { type: 'object' } },
        x_field: { type: 'string' },
        y_field: { type: 'string' },
        series_field: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['type', 'data', 'x_field', 'y_field', 'title'],
    },
  },
  {
    name: 'suggest_promotion',
    description: 'Generate a promotion rule JSON for a given business goal.',
    input_schema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          enum: ['clear-stock', 'boost-margin', 'attract-new', 'retain-loyal'],
        },
        constraints: { type: 'string' },
      },
      required: ['goal'],
    },
  },
];

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

async function querySales(
  input: {
    date_from: string;
    date_to: string;
    group_by?: string;
    limit?: number;
  },
  businessId: string
): Promise<unknown> {
  const supabase = createServerSupabaseClient();
  const { data: sales } = await supabase
    .from('pos_sales')
    .select('id, total_amount, payment_method, cashier_id, cashier_name, created_at, status')
    .eq('business_id', businessId)
    .neq('status', 'voided')
    .gte('created_at', `${input.date_from}T00:00:00`)
    .lte('created_at', `${input.date_to}T23:59:59`)
    .order('created_at');

  const rows = sales ?? [];

  if (input.group_by === 'product') {
    const saleIds = rows.map(r => r.id);
    if (saleIds.length === 0) {
      return { rows: [], total_revenue: 0, total_transactions: 0 };
    }
    const { data: items } = await supabase
      .from('pos_sale_items')
      .select('product_id, product_name, quantity, unit_price, sale_id')
      .in('sale_id', saleIds);

    const grouped: Record<string, { product_id: string; product_name: string; quantity: number; revenue: number }> = {};
    for (const item of items ?? []) {
      const key = item.product_id ?? item.product_name ?? 'unknown';
      if (!grouped[key]) {
        grouped[key] = { product_id: item.product_id, product_name: item.product_name, quantity: 0, revenue: 0 };
      }
      grouped[key].quantity += item.quantity ?? 0;
      grouped[key].revenue += (item.quantity ?? 0) * (item.unit_price ?? 0);
    }
    const productRows = Object.values(grouped).sort((a, b) => b.revenue - a.revenue);
    const limited = input.limit ? productRows.slice(0, input.limit) : productRows;
    return {
      rows: limited,
      total_revenue: rows.reduce((s, r) => s + (r.total_amount ?? 0), 0),
      total_transactions: rows.length,
    };
  }

  const grouped: Record<string, { key: string; revenue: number; transactions: number }> = {};
  for (const row of rows) {
    let key: string;
    if (input.group_by === 'day') key = row.created_at.slice(0, 10);
    else if (input.group_by === 'week') key = getWeekKey(row.created_at.slice(0, 10));
    else if (input.group_by === 'month') key = getMonthKey(row.created_at);
    else if (input.group_by === 'cashier') key = row.cashier_name ?? row.cashier_id ?? 'unknown';
    else if (input.group_by === 'payment_method') key = row.payment_method ?? 'unknown';
    else key = row.created_at.slice(0, 10);

    if (!grouped[key]) grouped[key] = { key, revenue: 0, transactions: 0 };
    grouped[key].revenue += row.total_amount ?? 0;
    grouped[key].transactions += 1;
  }

  const result = Object.values(grouped).sort((a, b) => a.key.localeCompare(b.key));
  const limited = input.limit ? result.slice(0, input.limit) : result;

  return {
    rows: limited,
    total_revenue: rows.reduce((s, r) => s + (r.total_amount ?? 0), 0),
    total_transactions: rows.length,
  };
}

async function queryInventory(
  input: { low_stock_only?: boolean; dead_stock_only?: boolean; limit?: number },
  businessId: string
): Promise<unknown> {
  const supabase = createServerSupabaseClient();
  const query = supabase
    .from('pos_products')
    .select('id, name, sku, stock_quantity, reorder_point, cost_price, retail_price, category')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('track_stock', true);

  const { data: products } = await query.order('stock_quantity').limit(input.limit ?? 200);
  const rows = products ?? [];

  let filtered = rows;

  if (input.low_stock_only) {
    filtered = rows.filter(p => (p.stock_quantity ?? 0) <= (p.reorder_point ?? 0));
  }

  if (input.dead_stock_only) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const productIds = rows.map(p => p.id);
    if (productIds.length > 0) {
      const { data: recentItems } = await supabase
        .from('pos_sale_items')
        .select('product_id')
        .in('product_id', productIds)
        .gte('created_at', cutoff);
      const activeSet = new Set((recentItems ?? []).map(i => i.product_id));
      filtered = rows.filter(p => !activeSet.has(p.id));
    }
  }

  const limited = input.limit ? filtered.slice(0, input.limit) : filtered;
  return { products: limited, count: limited.length };
}

async function queryCustomers(
  input: { segment?: string; sort_by?: string; limit?: number; search?: string },
  businessId: string
): Promise<unknown> {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from('pos_customers')
    .select('id, first_name, last_name, email, phone, total_spent, last_visit, visit_count, segment, created_at')
    .eq('business_id', businessId);

  if (input.segment) query = query.eq('segment', input.segment);
  if (input.search) {
    query = query.or(
      `first_name.ilike.%${input.search}%,last_name.ilike.%${input.search}%,email.ilike.%${input.search}%`
    );
  }

  const sortCol =
    input.sort_by === 'ltv' ? 'total_spent' :
    input.sort_by === 'recency' ? 'last_visit' :
    input.sort_by === 'frequency' ? 'visit_count' :
    'total_spent';

  const { data: customers } = await query
    .order(sortCol, { ascending: false })
    .limit(input.limit ?? 50);

  return { customers: customers ?? [], count: (customers ?? []).length };
}

async function comparePeriods(
  input: {
    metric: string;
    period_a: { from: string; to: string };
    period_b: { from: string; to: string };
  },
  businessId: string
): Promise<unknown> {
  const supabase = createServerSupabaseClient();

  async function fetchPeriodSales(from: string, to: string) {
    const { data } = await supabase
      .from('pos_sales')
      .select('total_amount, status')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`);
    return data ?? [];
  }

  function computeMetric(rows: { total_amount: number }[], metric: string): number {
    const total = rows.reduce((s, r) => s + (r.total_amount ?? 0), 0);
    if (metric === 'revenue') return total;
    if (metric === 'transactions') return rows.length;
    if (metric === 'avg_order') return rows.length ? total / rows.length : 0;
    return 0;
  }

  const [rowsA, rowsB] = await Promise.all([
    fetchPeriodSales(input.period_a.from, input.period_a.to),
    fetchPeriodSales(input.period_b.from, input.period_b.to),
  ]);

  const valA = computeMetric(rowsA, input.metric);
  const valB = computeMetric(rowsB, input.metric);
  const changePct = valA === 0 ? null : ((valB - valA) / valA) * 100;

  return {
    period_a: { from: input.period_a.from, to: input.period_a.to, value: valA },
    period_b: { from: input.period_b.from, to: input.period_b.to, value: valB },
    metric: input.metric,
    change_pct: changePct !== null ? parseFloat(changePct.toFixed(2)) : null,
    direction: changePct === null ? 'unknown' : changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat',
  };
}

function suggestPromotion(input: { goal: string; constraints?: string }): unknown {
  const promotions: Record<string, { type: string; discount_pct: number; expiry_days: number; applies_to: string }> = {
    'clear-stock': { type: 'clearance', discount_pct: 30, expiry_days: 14, applies_to: 'dead_stock_products' },
    'boost-margin': { type: 'bundle', discount_pct: 10, expiry_days: 30, applies_to: 'high_margin_products' },
    'attract-new': { type: 'first_purchase', discount_pct: 15, expiry_days: 60, applies_to: 'all_products' },
    'retain-loyal': { type: 'loyalty_reward', discount_pct: 20, expiry_days: 30, applies_to: 'top_customers' },
  };

  const rule = promotions[input.goal] ?? { type: 'general', discount_pct: 10, expiry_days: 30, applies_to: 'all_products' };

  return {
    goal: input.goal,
    constraints: input.constraints ?? null,
    rule_jsonb: rule,
  };
}

export async function executePOSTool(name: string, input: unknown, businessId: string): Promise<unknown> {
  const inp = input as Record<string, unknown>;

  switch (name) {
    case 'query_sales':
      return querySales(inp as Parameters<typeof querySales>[0], businessId);
    case 'query_inventory':
      return queryInventory(inp as Parameters<typeof queryInventory>[0], businessId);
    case 'query_customers':
      return queryCustomers(inp as Parameters<typeof queryCustomers>[0], businessId);
    case 'compare_periods':
      return comparePeriods(inp as Parameters<typeof comparePeriods>[0], businessId);
    case 'generate_chart':
      return { chart_spec: inp };
    case 'suggest_promotion':
      return suggestPromotion(inp as Parameters<typeof suggestPromotion>[0]);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
