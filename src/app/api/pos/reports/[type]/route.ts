export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { generateInsight } from '@/lib/aria-insights';
import { toAESTStart, toAESTEnd, todayAEST, thirtyDaysAgoAEST, buildDateRange } from '@/lib/date-au';
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ type: string }> };

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request, { params }: Params) {
  const { type } = await params;
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { searchParams } = new URL(req.url);

  // ── Permission check: view reports ────────────────────────────────
  const report_pos_user_id = searchParams.get('pos_user_id')
  if (report_pos_user_id) {
    const { getPosUser, resolvePermissions, checkFlag } = await import('@/lib/pos/check-permission')
    const posUser = await getPosUser(supabase, report_pos_user_id, bid)
    if (posUser) {
      const perms = resolvePermissions(posUser)
      if (!checkFlag(perms, 'can_view_reports')) {
        return NextResponse.json({ error: 'You do not have permission to view reports' }, { status: 403 })
      }
    }
  }

  // Default to last 30 days in AEST if not supplied
  const defaultRange = buildDateRange('month');
  const from = searchParams.get('from') ?? defaultRange.from.split('T')[0];
  const to   = searchParams.get('to')   ?? defaultRange.to.split('T')[0];

  const outletId  = searchParams.get('outlet_id');
  const withInsight = searchParams.get('insight') !== '0';

  try {
    switch (type) {
      case 'dashboard': return await getDashboard(supabase, bid, from, to, outletId, withInsight);
      case 'inventory': return await getInventory(supabase, bid, from, to, searchParams);
      case 'cashier':   return await getCashier(supabase, bid, from, to, searchParams);
      case 'commission':return await getCommission(supabase, bid, from, to, searchParams);
      case 'closures':  return await getClosures(supabase, bid, from, to, searchParams);
      case 'actions':   return await getActions(supabase, bid, from, to, searchParams);
      case 'advanced':  return await getAdvanced(supabase, bid, from, to, searchParams);
      case 'briefing':  return await getBriefing(supabase, bid);
      default: return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
    }
  } catch (e) {
    console.error(`[reports/${type}]`, e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function _POST(req: Request, { params }: Params) {
  const { type } = await params;
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  if (type === 'advanced') {
    const body = await req.json();
    return await getAdvancedPost(supabase, bid, body);
  }

  return NextResponse.json({ error: 'POST not supported for this type' }, { status: 400 });
}

// ── DASHBOARD ──────────────────────────────────────────────────
async function getDashboard(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bid: string, from: string, to: string, outletId: string | null, withInsight: boolean
) {
  const fromISO = toAESTStart(from);
  const toISO   = toAESTEnd(to);

  // INTEL-COMPUTE-3 — was neq('voided'), admitted draft/refunded rows. status='completed' matches
  // getRevenueSnapshot()'s canonical rule. Live handler — feeds /pos/reports/sales's dashboard tab.
  let q = supabase.from('pos_sales')
    .select('id,total_amount,tax_amount,discount_amount,payment_method,created_at,outlet_id,served_by,pos_customers(name)')
    .eq('business_id', bid)
    .eq('status', 'completed')
    .gte('created_at', fromISO)
    .lte('created_at', toISO);
  if (outletId) q = q.eq('outlet_id', outletId);
  const { data: sales } = await q.order('created_at');

  const rows = (sales ?? []) as unknown as Array<{
    id: string; total_amount: number; tax_amount: number; discount_amount: number;
    payment_method: string; created_at: string; outlet_id: string; served_by: string;
    pos_customers: { name: string } | null;
  }>;

  const revenue  = rows.reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const count    = rows.length;
  const customers = new Set(rows.map(r => r.pos_customers?.name).filter(Boolean)).size;
  const avgSale  = count ? revenue / count : 0;

  // Daily breakdown
  const dayMap = new Map<string, { revenue: number; count: number }>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    const e = dayMap.get(day) ?? { revenue: 0, count: 0 };
    e.revenue += r.total_amount ?? 0;
    e.count += 1;
    dayMap.set(day, e);
  }
  const daily = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top 20 products — try RPC first, fall back to JS aggregation
  let topProducts: Array<{ name: string; revenue: number; quantity: number }> = [];
  try {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('get_top_products', {
      p_business_id: bid,
      p_from: fromISO,
      p_to: toISO,
      p_limit: 20,
    });
    if (!rpcErr && rpcResult && Array.isArray(rpcResult) && rpcResult.length > 0) {
      topProducts = (rpcResult as Array<{ product_name: string; revenue: number; quantity: number }>)
        .map(r => ({ name: r.product_name, revenue: Number(r.revenue), quantity: Number(r.quantity) }));
    }
  } catch (e) { console.error('[silent-catch]', e) }

  // Fallback: JS-side aggregation from fetched sales
  if (topProducts.length === 0 && rows.length > 0) {
    const { data: topItems } = await supabase.from('pos_sale_items')
      .select('product_name,quantity,line_total')
      .eq('business_id', bid)
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .limit(2000);

    const prodMap = new Map<string, { revenue: number; qty: number }>();
    for (const item of (topItems ?? []) as Array<{ product_name: string; quantity: number; line_total: number }>) {
      const e = prodMap.get(item.product_name) ?? { revenue: 0, qty: 0 };
      e.revenue += item.line_total ?? 0;
      e.qty += item.quantity ?? 0;
      prodMap.set(item.product_name, e);
    }
    topProducts = Array.from(prodMap.entries())
      .map(([name, v]) => ({ name, revenue: v.revenue, quantity: v.qty }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);
  }

  // Outlet breakdown
  const outletMap = new Map<string, number>();
  for (const r of rows) {
    outletMap.set(r.outlet_id, (outletMap.get(r.outlet_id) ?? 0) + (r.total_amount ?? 0));
  }
  const byOutlet = Array.from(outletMap.entries()).map(([outlet_id, rev]) => ({ outlet_id, revenue: rev }));

  let insight: { bullets: string[] } | null = null;
  if (withInsight) {
    const bestDay  = daily.length > 0 ? daily.reduce((b, d) => d.revenue > b.revenue ? d : b) : null;
    const worstDay = daily.length > 0 ? daily.reduce((w, d) => d.revenue < w.revenue ? d : w) : null;
    const ctx = `sales_dashboard period=${from}_to_${to} revenue=$${revenue.toFixed(0)} transactions=${count} avg_sale=$${avgSale.toFixed(2)} top_product="${topProducts[0]?.name ?? ''}" top_product_revenue=$${(topProducts[0]?.revenue ?? 0).toFixed(0)} best_day="${bestDay?.date ?? ''}" worst_day="${worstDay?.date ?? ''}"`;
    const res = await generateInsight({ business_id: bid, context: ctx, data: { revenue, count, topProducts: topProducts.slice(0, 5) }, maxBullets: 2 });
    insight = { bullets: res.bullets };
  }

  return NextResponse.json({ revenue, count, customers, avgSale, daily, topProducts, byOutlet, insight });
}

// ── INVENTORY ─────────────────────────────────────────────────
async function getInventory(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bid: string, from: string, to: string, params: URLSearchParams
) {
  const lowStockOnly = params.get('low_stock') === '1';
  const deadStock    = params.get('dead_stock') === '1';
  const search       = params.get('search') ?? '';

  let q = supabase.from('pos_products')
    .select('id,name,sku,stock_quantity,low_stock_threshold,cost_price,price,track_stock,pos_categories(name)')
    .eq('business_id', bid).eq('is_active', true);
  if (search) q = q.ilike('name', `%${search}%`);
  const { data: products } = await q.limit(500);

  const rows = (products ?? []) as unknown as Array<{
    id: string; name: string; sku: string; stock_quantity: number;
    low_stock_threshold: number; cost_price: number; price: number; track_stock: boolean;
    pos_categories: { name: string } | null;
  }>;

  // 30-day velocity using AEST-aware cutoff
  const fromDate = thirtyDaysAgoAEST();
  const { data: saleItems } = await supabase.from('pos_sale_items')
    .select('product_id,quantity,created_at')
    .eq('business_id', bid)
    .gte('created_at', fromDate)
    .limit(5000);

  const velocityMap = new Map<string, number>();
  for (const si of (saleItems ?? []) as Array<{ product_id: string; quantity: number; created_at: string }>) {
    velocityMap.set(si.product_id, (velocityMap.get(si.product_id) ?? 0) + (si.quantity ?? 0));
  }

  const inventory = rows.map(p => {
    const sold30d = velocityMap.get(p.id) ?? 0;
    const avgDaily = sold30d / 30;
    const daysOfStock = avgDaily > 0 ? (p.stock_quantity ?? 0) / avgDaily : null;
    const isDead = sold30d === 0 && (p.stock_quantity ?? 0) > 0;
    const status = isDead ? 'dead' : (daysOfStock == null ? 'unknown' : daysOfStock < 3 ? 'critical' : daysOfStock < 7 ? 'low' : 'ok');
    return {
      ...p,
      category: (p.pos_categories as unknown as { name: string } | null)?.name ?? '—',
      avg_daily: avgDaily,
      days_of_stock: daysOfStock,
      status,
      value_cost:   (p.stock_quantity ?? 0) * (p.cost_price ?? 0),
      value_retail: (p.stock_quantity ?? 0) * (p.price ?? 0),
    };
  }).filter(p => {
    if (lowStockOnly && !['critical','low'].includes(p.status)) return false;
    if (deadStock && p.status !== 'dead') return false;
    return true;
  }).sort((a, b) => {
    const order: Record<string, number> = { critical: 0, low: 1, ok: 2, dead: 3, unknown: 4 };
    const oa = order[a.status] ?? 5, ob = order[b.status] ?? 5;
    if (oa !== ob) return oa - ob;
    return (a.days_of_stock ?? 999) - (b.days_of_stock ?? 999);
  });

  const criticalItems = inventory.filter(i => i.status === 'critical');
  const amberItems    = inventory.filter(i => i.status === 'low');
  const deadItems     = inventory.filter(i => i.status === 'dead');
  const criticalCount = criticalItems.length;
  const deadValue     = deadItems.reduce((s, i) => s + i.value_cost, 0);
  const reorderTop    = criticalItems.slice(0, 3).map(i => i.name);

  let insight: { bullets: string[] } | null = null;
  if (bid) {
    const ctx = `inventory_report critical_count=${criticalCount} amber_count=${amberItems.length} dead_stock_count=${deadItems.length} dead_stock_value=$${deadValue.toFixed(0)} top_critical="${criticalItems[0]?.name ?? ''}" days_left=${criticalItems[0]?.days_of_stock?.toFixed(1) ?? 'N/A'} top_dead="${deadItems[0]?.name ?? ''}" dead_value_each=$${(deadItems[0]?.value_cost ?? 0).toFixed(0)}`;
    const res = await generateInsight({ business_id: bid, context: ctx, data: { criticalCount, deadValue, reorderTop, count: inventory.length }, maxBullets: 2 });
    insight = { bullets: res.bullets };
  }

  return NextResponse.json({ inventory, insight });
}

// ── CASHIER ────────────────────────────────────────────────────
async function getCashier(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bid: string, from: string, to: string, params: URLSearchParams
) {
  const fromISO = toAESTStart(from);
  const toISO   = toAESTEnd(to);

  const { data: sales } = await supabase.from('pos_sales')
    .select('id,total_amount,served_by,payment_method,created_at')
    .eq('business_id', bid)
    .neq('status', 'voided')
    .gte('created_at', fromISO).lte('created_at', toISO)
    .limit(2000);

  const { data: actions } = await supabase.from('activity_log')
    .select('action_type,metadata,created_at')
    .eq('business_id', bid)
    .gte('created_at', fromISO).lte('created_at', toISO)
    .in('action_type', ['void','refund','no_sale_open','discount_apply','register_opened','register_closed','sale_completed'])
    .limit(2000);

  // served_by is already a text display name — no join needed
  const salesTyped = (sales ?? []) as Array<{ id: string; total_amount: number; served_by: string; payment_method: string; created_at: string }>;

  const cashierMap = new Map<string, {
    name: string; sales: number; transactions: number;
    voids: number; refunds: number; noSaleOpens: number; discountTotal: number;
  }>();

  for (const s of salesTyped) {
    const key = s.served_by ?? 'Unknown';
    const e = cashierMap.get(key) ?? { name: key, sales: 0, transactions: 0, voids: 0, refunds: 0, noSaleOpens: 0, discountTotal: 0 };
    e.sales += s.total_amount ?? 0;
    e.transactions += 1;
    cashierMap.set(key, e);
  }

  for (const a of (actions ?? []) as Array<{ action_type: string; metadata?: Record<string, unknown>; created_at: string }>) {
    const key = (a.metadata?.user_id as string | undefined) ?? 'Unknown';
    const e = cashierMap.get(key) ?? { name: key, sales: 0, transactions: 0, voids: 0, refunds: 0, noSaleOpens: 0, discountTotal: 0 };
    if (a.action_type === 'void')        e.voids += 1;
    else if (a.action_type === 'refund') e.refunds += 1;
    else if (a.action_type === 'no_sale_open') e.noSaleOpens += 1;
    cashierMap.set(key, e);
  }

  const rows = Array.from(cashierMap.values())
    .map(r => ({ ...r, avg_sale: r.transactions ? r.sales / r.transactions : 0 }))
    .sort((a, b) => b.sales - a.sales);

  const top = rows[0];
  const avgVoids = rows.reduce((s, r) => s + r.voids, 0) / Math.max(rows.length, 1);
  const watch = rows.filter(r => r.voids > avgVoids * 2 && r.voids >= 3)[0];
  const mostVoidsRow = rows.reduce((m, r) => (m && m.voids >= r.voids) ? m : r, rows[0]);
  const avgTransaction = rows.length > 0 ? rows.reduce((s, r) => s + r.avg_sale, 0) / rows.length : 0;

  let insight: { bullets: string[] } | null = null;
  if (bid) {
    const ctx = `cashier_report top_cashier="${top?.name ?? ''}" revenue=$${(top?.sales ?? 0).toFixed(0)} top_transactions=${top?.transactions ?? 0} most_voids="${mostVoidsRow?.name ?? ''}" void_count=${mostVoidsRow?.voids ?? 0} avg_void_benchmark=${avgVoids.toFixed(1)} avg_transaction=$${avgTransaction.toFixed(2)} cashier_count=${rows.length}`;
    const res = await generateInsight({ business_id: bid, context: ctx, data: { top_cashier: top?.name, revenue: top?.sales, count: rows.length }, maxBullets: 2 });
    insight = { bullets: res.bullets };
  }

  return NextResponse.json({ rows, insight });
}

// ── COMMISSION ─────────────────────────────────────────────────
async function getCommission(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bid: string, from: string, to: string, _params: URLSearchParams
) {
  const fromISO = toAESTStart(from);
  const toISO   = toAESTEnd(to);

  const { data: rules } = await supabase.from('pos_commission_rules').select('*').eq('business_id', bid).is('effective_until', null).limit(50);
  const { data: sales }  = await supabase.from('pos_sales').select('id,total_amount,served_by,created_at').eq('business_id', bid).neq('status', 'voided').gte('created_at', fromISO).lte('created_at', toISO).limit(2000);

  const staffMap = new Map<string, { name: string; total: number }>();
  for (const s of (sales ?? []) as Array<{ id: string; total_amount: number; served_by: string }>) {
    const key = s.served_by ?? 'Unknown';
    const e = staffMap.get(key) ?? { name: key, total: 0 };
    e.total += s.total_amount ?? 0;
    staffMap.set(key, e);
  }

  const ruleList = (rules ?? []) as Array<{ id: string; staff_id: string | null; rule_type: string; rate_pct: number; flat_cents: number; applies_to: string }>;
  const defaultRule = ruleList.find(r => r.staff_id == null);

  const rows = Array.from(staffMap.values()).map(s => {
    const rule = ruleList.find(r => r.staff_id === s.name) ?? defaultRule;
    const commission = rule ? (s.total * ((rule.rate_pct ?? 0) / 100)) : 0;
    return { name: s.name, total: s.total, rule: rule ? `${rule.rate_pct}% of sale` : 'No rule', commission };
  }).sort((a, b) => b.commission - a.commission);

  const totalRevenue    = rows.reduce((s, r) => s + r.total, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const pct = totalRevenue ? (totalCommission / totalRevenue * 100) : 0;

  let insight: { bullets: string[] } | null = null;
  if (bid) {
    const top = rows[0];
    const res = await generateInsight({ business_id: bid, context: 'commission report', data: { top: top ? { name: top.name, commission: top.commission } : null, totalCommission, commissionPct: pct }, maxBullets: 2 });
    insight = { bullets: res.bullets };
  }

  return NextResponse.json({ rows, rules: ruleList, totalCommission, totalRevenue, commissionPct: pct, insight });
}

// ── CLOSURES ───────────────────────────────────────────────────
async function getClosures(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bid: string, from: string, to: string, _params: URLSearchParams
) {
  const fromISO = toAESTStart(from);
  const toISO   = toAESTEnd(to);

  // pos_closures table doesn't exist — query pos_cash_sessions instead
  const { data: sessions } = await supabase.from('pos_cash_sessions')
    .select('*')
    .eq('business_id', bid)
    .eq('status', 'closed')
    .gte('closed_at', fromISO).lte('closed_at', toISO)
    .order('closed_at', { ascending: false })
    .limit(200);

  // Compute per-session totals from actual pos_sales (session columns may be null)
  const sessionIds = (sessions ?? []).map((s: Record<string, unknown>) => s.id as string);
  const { data: salesData } = sessionIds.length > 0
    ? await supabase.from('pos_sales').select('session_id, payment_method, total_amount')
        .in('session_id', sessionIds).neq('status', 'voided')
    : { data: [] };

  const salesMap: Record<string, { cash: number; card: number; total: number; count: number }> = {};
  for (const sale of salesData ?? []) {
    const sid = sale.session_id as string;
    if (!sid) continue;
    if (!salesMap[sid]) salesMap[sid] = { cash: 0, card: 0, total: 0, count: 0 };
    const amt = Number(sale.total_amount ?? 0);
    const method = String(sale.payment_method ?? 'cash');
    salesMap[sid].total += amt; salesMap[sid].count += 1;
    if (method === 'cash') salesMap[sid].cash += amt; else salesMap[sid].card += amt;
  }

  const rows = (sessions ?? []).map((s: Record<string, unknown>) => {
    const totals = salesMap[s.id as string] ?? { cash: 0, card: 0, total: 0, count: 0 };
    const opening = Number(s.opening_float ?? 0);
    const actualCash = s.actual_cash_cents != null
      ? Number(s.actual_cash_cents) / 100 : (s.closing_float != null ? Number(s.closing_float) : null);
    const expectedCash = opening + totals.cash;
    const variance_cents = actualCash != null ? Math.round((actualCash - expectedCash) * 100) : 0;
    const opened = s.opened_at ? new Date(s.opened_at as string) : null;
    const closed = s.closed_at ? new Date(s.closed_at as string) : null;
    const duration_mins = opened && closed ? Math.round((closed.getTime() - opened.getTime()) / 60000) : null;
    return {
      ...s,
      total_cash_sales: totals.cash, total_card_sales: totals.card,
      total_revenue: totals.total, transaction_count: totals.count,
      expected_cash: expectedCash, actual_cash: actualCash, variance_cents, duration_mins,
      open_float_cents: Math.round(opening * 100),
      counted_cash_cents: s.actual_cash_cents != null ? Number(s.actual_cash_cents) : Math.round((actualCash ?? 0) * 100),
      expected_cash_cents: Math.round(expectedCash * 100),
      card_total_cents: Math.round(totals.card * 100),
      total_sales_cents: Math.round(totals.total * 100),
    };
  });

  const totalVariance = rows.reduce((s, r) => s + (r.variance_cents as number ?? 0), 0);

  let insight: { bullets: string[] } | null = null;
  try {
    const res = await generateInsight({ business_id: bid, context: 'register closures report', data: { closures: rows.length, totalVarianceCents: totalVariance }, maxBullets: 2 });
    insight = { bullets: res.bullets };
  } catch { /* insight is optional */ }

  return NextResponse.json({ closures: rows, insight });
}

// ── ACTIONS ────────────────────────────────────────────────────
async function getActions(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bid: string, from: string, to: string, params: URLSearchParams
) {
  const actionType = params.get('action_type');
  const page       = parseInt(params.get('page') ?? '1');
  const pageSize   = 100;
  const fromISO    = toAESTStart(from);
  const toISO      = toAESTEnd(to);

  // pos_action_log doesn't exist — activity_log is the real table
  let q = supabase.from('activity_log').select('*', { count: 'exact' })
    .eq('business_id', bid)
    .gte('created_at', fromISO).lte('created_at', toISO)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (actionType) q = q.eq('action_type', actionType);
  const { data: actions, count } = await q;

  const rows = (actions ?? []) as Record<string, unknown>[];
  const typeCounts = new Map<string, number>();
  for (const a of rows) { const t = String(a.action_type); typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1); }
  const topAction = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  let insight: { bullets: string[] } | null = null;
  if (bid) {
    const res = await generateInsight({ business_id: bid, context: 'actions audit log', data: { total: count, topAction: topAction ? { type: topAction[0], count: topAction[1] } : null }, maxBullets: 2 });
    insight = { bullets: res.bullets };
  }

  return NextResponse.json({ actions: rows, total: count, page, pageSize, insight });
}

// ── ADVANCED ───────────────────────────────────────────────────
async function getAdvanced(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  bid: string, from: string, to: string, params: URLSearchParams
) {
  const reportType    = params.get('report_type') ?? 'Product';
  const groupBy       = params.get('group_by');
  const includeDeleted = params.get('include_deleted') === '1';
  const fromISO = toAESTStart(from);
  const toISO   = toAESTEnd(to);

  let data: Record<string, unknown>[] = [];

  if (reportType === 'Product' || reportType === 'product') {
    let q = supabase.from('pos_products').select('id,name,sku,price,cost_price,pos_categories(name)').eq('business_id', bid);
    if (!includeDeleted) q = q.eq('is_active', true);
    const { data: prods } = await q.limit(500);

    // INTEL-COMPUTE-3 — had NO status filter at all (worse than neq('voided')) — draft, voided, and
    // refunded sales all leaked into this product-level revenue/profit report.
    const { data: salesIds } = await supabase.from('pos_sales').select('id').eq('business_id', bid).eq('status', 'completed').gte('created_at', fromISO).lte('created_at', toISO).limit(1000);
    const { data: si } = await supabase.from('pos_sale_items')
      .select('product_id,quantity,line_total,discount_percent')
      .in('sale_id', (salesIds ?? []).map((s: { id: string }) => s.id))
      .limit(5000);

    const salesByProd = new Map<string, { revenue: number; qty: number; discount: number }>();
    for (const s of (si ?? []) as Array<{ product_id: string; quantity: number; line_total: number; discount_percent: number }>) {
      const e = salesByProd.get(s.product_id) ?? { revenue: 0, qty: 0, discount: 0 };
      e.revenue += s.line_total ?? 0;
      e.qty += s.quantity ?? 0;
      salesByProd.set(s.product_id, e);
    }

    const totalRevAll = Array.from(salesByProd.values()).reduce((s, v) => s + v.revenue, 0);

    data = ((prods ?? []) as unknown as Array<{ id: string; name: string; sku: string; price: number; cost_price: number; pos_categories: { name: string } | null }>).map(p => {
      const s = salesByProd.get(p.id) ?? { revenue: 0, qty: 0, discount: 0 };
      const cogs   = s.qty * (p.cost_price ?? 0);
      const profit = s.revenue - cogs;
      return {
        name: p.name, sku: p.sku,
        category: (p.pos_categories as unknown as { name: string } | null)?.name ?? '—',
        revenue: s.revenue, cogs, transaction_count: s.qty,
        avg_sale: s.qty ? s.revenue / s.qty : 0,
        profit, profit_pct: s.revenue ? (profit / s.revenue * 100) : 0,
        discount_amount: s.discount,
        revenue_pct: totalRevAll ? (s.revenue / totalRevAll * 100) : 0,
        items_sold: s.qty,
      };
    }).sort((a, b) => (b.revenue as number) - (a.revenue as number));
  }

  const sql = `SELECT name, SUM(line_total) as revenue FROM pos_products JOIN pos_sale_items USING(product_id) JOIN pos_sales USING(id) WHERE business_id='${bid}' AND created_at BETWEEN '${fromISO}' AND '${toISO}' GROUP BY name ORDER BY revenue DESC LIMIT 500`;

  let insight: { bullets: string[] } | null = null;
  if (bid && data.length > 0) {
    const typedData = data as Array<{ revenue?: number; profit?: number; name?: string }>;
    const totRevenue = typedData.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const totProfit  = typedData.reduce((s, r) => s + (r.profit ?? 0), 0);
    const profitPct  = totRevenue > 0 ? (totProfit / totRevenue * 100) : 0;
    const ctx = `advanced_report type=${reportType} group_by=${groupBy ?? 'none'} row_count=${data.length} total_revenue=$${totRevenue.toFixed(0)} total_profit=$${totProfit.toFixed(0)} profit_pct=${profitPct.toFixed(1)}% top_row="${typedData[0]?.name ?? ''}" top_revenue=$${(typedData[0]?.revenue ?? 0).toFixed(0)}`;
    const res = await generateInsight({ business_id: bid, context: ctx, data: { revenue: totRevenue, count: data.length, topProducts: typedData.slice(0, 3) }, maxBullets: 3 });
    insight = { bullets: res.bullets };
  }

  return NextResponse.json({ data, sql, reportType, groupBy, insight });
}

async function getAdvancedPost(supabase: ReturnType<typeof createServerSupabaseClient>, bid: string, body: Record<string, unknown>) {
  return NextResponse.json({ data: [], sql: '', reportType: body.report_type ?? 'Product', insight: null });
}

// ── BRIEFING ───────────────────────────────────────────────────
async function getBriefing(supabase: ReturnType<typeof createServerSupabaseClient>, bid: string) {
  const today = todayAEST();

  const { data: cached } = await supabase.from('aria_briefings_cache')
    .select('bullets')
    .eq('business_id', bid)
    .eq('briefing_date', today)
    .maybeSingle();

  if (cached) return NextResponse.json({ bullets: cached.bullets, generated_at: new Date().toISOString() });

  // INTEL-COMPUTE-3 — was neq('voided'), admitted draft/refunded rows. Live handler — feeds the
  // cached daily-briefing bullets on /pos/reports's landing page.
  const from7d = buildDateRange('week').from;
  const { data: salesW } = await supabase.from('pos_sales').select('total_amount,created_at').eq('business_id', bid).eq('status', 'completed').gte('created_at', from7d).limit(500);
  const revenue7d = ((salesW ?? []) as Array<{ total_amount: number }>).reduce((s, r) => s + (r.total_amount ?? 0), 0);

  const { data: lowStock } = await supabase.from('pos_products').select('name,stock_quantity,low_stock_threshold').eq('business_id', bid).eq('is_active', true).lt('stock_quantity', 5).limit(5);

  const res = await generateInsight({ business_id: bid, context: 'daily briefing — cross-report', data: { revenue7d, lowStockItems: (lowStock ?? []).length, date: today }, maxBullets: 3, realtime: true });

  await supabase.from('aria_briefings_cache').upsert({ business_id: bid, briefing_date: today, bullets: res.bullets }, { onConflict: 'business_id,briefing_date' });

  return NextResponse.json({ bullets: res.bullets, generated_at: new Date().toISOString() });
}

export const GET = withErrorCapture('pos/reports/[type]', _GET)
export const POST = withErrorCapture('pos/reports/[type]', _POST)
