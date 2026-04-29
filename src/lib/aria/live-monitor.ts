import { createServerSupabaseClient } from '@/lib/supabase-server';
import { runAriaModel, parseModelJson } from '@/lib/aria/model-router';

type Row = Record<string, any>;

export type LiveAlert = {
  type: 'stockout_risk' | 'surge' | 'slow' | 'cashflow' | 'staff' | 'product' | 'customer';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
};

export type LiveRecommendation = {
  action: string;
  reason: string;
  category: 'pricing' | 'ordering' | 'staffing' | 'marketing' | 'operations';
  urgency: 'now' | 'today' | 'this_week';
};

export type LiveSummary = {
  today_revenue_cents: number;
  today_transaction_count: number;
  today_vs_yesterday_pct: number | null;
  today_vs_last_week_pct: number | null;
  top_products_today: Array<{ name: string; qty: number; revenue_cents: number }>;
  low_stock_count: number;
  out_of_stock_count: number;
  active_staff_count: number;
};

export type LiveMonitorResult = {
  data_status: {
    has_pos_data: boolean;
    has_inventory: boolean;
    has_staff: boolean;
    last_sale_at: string | null;
    freshness: 'live' | 'stale' | 'empty';
  };
  live_summary: LiveSummary;
  alerts: LiveAlert[];
  recommendations: LiveRecommendation[];
  aria_commentary: string | null;
  generated_at: string;
};

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function yesterdayWindow() {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function lastWeekSameWindow() {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function safeQuery<T = Row>(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  table: string,
  build: (q: any) => any
): Promise<T[]> {
  try {
    const { data, error } = await build(supabase.from(table).select('*'));
    if (error) return [];
    return (Array.isArray(data) ? data : []) as T[];
  } catch {
    return [];
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function runLiveMonitor(businessId: string): Promise<LiveMonitorResult> {
  const supabase = createServerSupabaseClient();
  const today = todayStart();
  const yesterday = yesterdayWindow();
  const lastWeek = lastWeekSameWindow();
  const since7 = daysAgo(7);

  const [
    todaySales,
    yesterdaySales,
    lastWeekSales,
    todaySaleItems,
    products,
    stockMovements,
    staffShifts,
  ] = await Promise.all([
    safeQuery(supabase, 'pos_sales', q =>
      q.eq('business_id', businessId).gte('created_at', today).order('created_at', { ascending: false }).limit(500)
    ),
    safeQuery(supabase, 'pos_sales', q =>
      q.eq('business_id', businessId).gte('created_at', yesterday.start).lte('created_at', yesterday.end).limit(500)
    ),
    safeQuery(supabase, 'pos_sales', q =>
      q.eq('business_id', businessId).gte('created_at', lastWeek.start).lte('created_at', lastWeek.end).limit(500)
    ),
    safeQuery(supabase, 'pos_sale_items', q =>
      q.eq('business_id', businessId).gte('created_at', today).limit(2000)
    ),
    safeQuery(supabase, 'pos_products', q =>
      q.eq('business_id', businessId).order('name').limit(1000)
    ),
    safeQuery(supabase, 'stock_movements', q =>
      q.eq('business_id', businessId).gte('created_at', since7).order('created_at', { ascending: false }).limit(500)
    ),
    safeQuery(supabase, 'staff_shifts', q =>
      q.eq('business_id', businessId).gte('start_time', today).limit(50)
    ),
  ]);

  // --- Revenue aggregation ---
  const todayRevenue = todaySales.reduce((s, r) => s + (Number(r.total_cents ?? r.total ?? 0)), 0);
  const yesterdayRevenue = yesterdaySales.reduce((s, r) => s + (Number(r.total_cents ?? r.total ?? 0)), 0);
  const lastWeekRevenue = lastWeekSales.reduce((s, r) => s + (Number(r.total_cents ?? r.total ?? 0)), 0);

  // --- Top products today ---
  const productRevMap: Record<string, { name: string; qty: number; revenue_cents: number }> = {};
  for (const item of todaySaleItems) {
    const name = item.product_name ?? item.name ?? item.product_id ?? 'Unknown';
    const qty = Number(item.quantity ?? 1);
    const rev = Number(item.total_cents ?? item.subtotal_cents ?? item.price_cents ?? 0);
    if (!productRevMap[name]) productRevMap[name] = { name, qty: 0, revenue_cents: 0 };
    productRevMap[name].qty += qty;
    productRevMap[name].revenue_cents += rev;
  }
  const topProductsToday = Object.values(productRevMap)
    .sort((a, b) => b.revenue_cents - a.revenue_cents)
    .slice(0, 5);

  // --- Stock status ---
  const lowStockProducts = products.filter(p => {
    const stock = Number(p.current_stock ?? p.stock_quantity ?? 0);
    const threshold = Number(p.low_stock_threshold ?? p.reorder_point ?? 5);
    return stock > 0 && stock <= threshold;
  });
  const outOfStock = products.filter(p => {
    const stock = Number(p.current_stock ?? p.stock_quantity ?? null);
    return stock !== null && stock <= 0;
  });

  // --- Active staff ---
  const activeStaff = staffShifts.filter(s => !s.end_time || new Date(s.end_time) > new Date());

  // --- Data freshness ---
  const lastSale = todaySales[0] ?? null;
  const lastSaleAt = lastSale?.created_at ?? null;
  const hasPosData = todaySales.length > 0 || products.length > 0;
  const hasInventory = products.length > 0 || stockMovements.length > 0;

  let freshness: 'live' | 'stale' | 'empty' = 'empty';
  if (todaySales.length > 0) {
    const minutesAgo = lastSaleAt
      ? (Date.now() - new Date(lastSaleAt).getTime()) / 60000
      : Infinity;
    freshness = minutesAgo < 120 ? 'live' : 'stale';
  } else if (hasPosData) {
    freshness = 'stale';
  }

  // --- Build alerts (pure data, no AI) ---
  const alerts: LiveAlert[] = [];

  for (const p of outOfStock.slice(0, 5)) {
    alerts.push({
      type: 'stockout_risk',
      severity: 'critical',
      title: `${p.name} is out of stock`,
      detail: `Current stock: 0. Customers may be turned away.`,
    });
  }

  for (const p of lowStockProducts.slice(0, 5)) {
    const stock = Number(p.current_stock ?? p.stock_quantity ?? 0);
    alerts.push({
      type: 'stockout_risk',
      severity: 'warning',
      title: `${p.name} is running low`,
      detail: `Only ${stock} units left — below reorder point.`,
    });
  }

  const vsYesterday = pctChange(todayRevenue, yesterdayRevenue);
  if (vsYesterday !== null && vsYesterday <= -30 && todayRevenue > 0) {
    alerts.push({
      type: 'slow',
      severity: 'warning',
      title: `Sales ${Math.abs(vsYesterday)}% below yesterday`,
      detail: `A$${centsToDollars(todayRevenue)} today vs A$${centsToDollars(yesterdayRevenue)} yesterday.`,
    });
  } else if (vsYesterday !== null && vsYesterday >= 30 && todayRevenue > 0) {
    alerts.push({
      type: 'surge',
      severity: 'info',
      title: `Sales up ${vsYesterday}% vs yesterday`,
      detail: `A$${centsToDollars(todayRevenue)} today vs A$${centsToDollars(yesterdayRevenue)} yesterday.`,
    });
  }

  // --- AI commentary (only when there's real data to comment on) ---
  let ariaCommentary: string | null = null;
  let recommendations: LiveRecommendation[] = [];

  if (hasPosData && (todaySales.length > 0 || products.length > 5)) {
    const context = {
      today_revenue_dollars: (todayRevenue / 100).toFixed(2),
      today_transactions: todaySales.length,
      vs_yesterday_pct: vsYesterday,
      vs_last_week_pct: pctChange(todayRevenue, lastWeekRevenue),
      top_products: topProductsToday.map(p => ({
        name: p.name,
        qty: p.qty,
        revenue: (p.revenue_cents / 100).toFixed(2),
      })),
      out_of_stock_count: outOfStock.length,
      low_stock_count: lowStockProducts.length,
      out_of_stock_names: outOfStock.slice(0, 5).map(p => p.name),
      low_stock_names: lowStockProducts.slice(0, 5).map(p => p.name),
      active_staff: activeStaff.length,
    };

    const result = await runAriaModel<{
      commentary: string;
      recommendations: Array<{ action: string; reason: string; category: string; urgency: string }>;
    }>({
      task: 'sales_analysis',
      systemPrompt: `You are Aria, an AI co-owner for an Australian retail/café/bottle shop.
Analyse real-time POS data and give a short, direct observation about what is happening right now.
Only reference data provided — never invent figures.
Be frank. Owners want clear, actionable intelligence, not reassurance.
Australian context: GST inclusive pricing, EFTPOS common, public holiday surcharges apply.`,
      userPrompt: `Live business data right now:\n${JSON.stringify(context, null, 2)}\n\nReturn JSON:\n{
  "commentary": "2-3 sentence direct observation of what is happening in this business right now",
  "recommendations": [
    { "action": "...", "reason": "...", "category": "pricing|ordering|staffing|marketing|operations", "urgency": "now|today|this_week" }
  ]
}`,
      maxTokens: 600,
      temperature: 0.15,
    });

    if (result.ok && result.data) {
      ariaCommentary = result.data.commentary ?? null;
      recommendations = (result.data.recommendations ?? []).slice(0, 4).map(r => ({
        action: String(r.action ?? ''),
        reason: String(r.reason ?? ''),
        category: (r.category as LiveRecommendation['category']) ?? 'operations',
        urgency: (r.urgency as LiveRecommendation['urgency']) ?? 'today',
      }));
    }
  }

  return {
    data_status: {
      has_pos_data: hasPosData,
      has_inventory: hasInventory,
      has_staff: staffShifts.length > 0,
      last_sale_at: lastSaleAt,
      freshness,
    },
    live_summary: {
      today_revenue_cents: todayRevenue,
      today_transaction_count: todaySales.length,
      today_vs_yesterday_pct: vsYesterday,
      today_vs_last_week_pct: pctChange(todayRevenue, lastWeekRevenue),
      top_products_today: topProductsToday,
      low_stock_count: lowStockProducts.length,
      out_of_stock_count: outOfStock.length,
      active_staff_count: activeStaff.length,
    },
    alerts,
    recommendations,
    aria_commentary: ariaCommentary,
    generated_at: new Date().toISOString(),
  };
}
