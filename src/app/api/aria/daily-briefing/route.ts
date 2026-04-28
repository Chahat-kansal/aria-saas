import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBusinessSales, getBusinessCustomers, getBusinessItems } from '@/lib/business-data';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, force_refresh } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // Verify ownership + get business details
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, owner_name, industry, city, monthly_revenue, staff_count, biggest_challenge, data_source')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const today = new Date().toISOString().split('T')[0];
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  // Cache check — skip Claude if fresh enough
  if (!force_refresh) {
    const { data: cached } = await supabase
      .from('daily_briefings')
      .select('recommendations, generated_at, data_snapshot, dismissed_at, remind_at')
      .eq('business_id', business_id)
      .eq('date', today)
      .maybeSingle();

    if (cached && cached.generated_at > sixHoursAgo && !cached.dismissed_at) {
      const remindAt = cached.remind_at ? new Date(cached.remind_at) : null;
      if (!remindAt || remindAt <= new Date()) {
        return NextResponse.json({
          recommendations: cached.recommendations,
          generated_at: cached.generated_at,
          data_snapshot: cached.data_snapshot,
          cached: true,
        });
      }
    }
  }

  // Parallel data fetch using unified layer + raw Supabase for non-normalised data
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const prevSevenStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const prevSevenEnd   = sevenDaysAgo;

  const dataSource = (business.data_source ?? 'aria_pos') as 'square' | 'aria_pos';

  const [
    sales7,
    salesPrev7,
    sales14daily,
    customers,
    items,
    unansweredReviews,
    recentWinbacks,
    unreadAlerts,
  ] = await Promise.all([
    getBusinessSales(business_id, sevenDaysAgo, dataSource),
    getBusinessSales(business_id, prevSevenStart, dataSource).then(s => s.filter(x => x.soldAt <= prevSevenEnd)),
    getBusinessSales(business_id, fourteenDaysAgo, dataSource),
    getBusinessCustomers(business_id, dataSource),
    getBusinessItems(business_id, dataSource),
    supabase.from('reviews').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).is('response', null)
      .gt('created_at', thirtyDaysAgo.toISOString()),
    supabase.from('campaigns').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).eq('type', 'winback')
      .gt('created_at', thirtyDaysAgo.toISOString()),
    supabase.from('competitor_alerts').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).eq('read', false),
  ]);

  // Revenue calculations
  const rev7     = sales7.reduce((s, x) => s + x.totalCents, 0);
  const revPrev7 = salesPrev7.reduce((s, x) => s + x.totalCents, 0);
  const revTrendPct = revPrev7 > 0 ? Math.round(((rev7 - revPrev7) / revPrev7) * 100) : 0;

  // Day-of-week revenue for slow day detection
  const dowRevenue: Record<number, number> = {};
  for (const sale of sales14daily) {
    const dow = sale.soldAt.getDay();
    dowRevenue[dow] = (dowRevenue[dow] ?? 0) + sale.totalCents;
  }
  const dowNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const slowestDow = Object.entries(dowRevenue).sort((a, b) => Number(a[1]) - Number(b[1]))[0];
  const slowestDayName = slowestDow ? dowNames[Number(slowestDow[0])] : null;

  // Customer analysis
  const lapsedCustomers = customers.filter(c => {
    if (!c.lastVisitAt) return true;
    return c.lastVisitAt < sixtyDaysAgo;
  });
  const highChurnCustomers = customers.filter(c => c.churnRisk === 'high' || c.churnRisk === 'churned');

  // Low stock items
  const lowStockItems = items.filter(i => i.reorderPoint > 0 && i.currentStock <= i.reorderPoint);

  // Warehouse-specific context
  let warehouseCtx: Record<string, unknown> = {};
  if (business.industry === 'warehouse') {
    const today30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    const [expLots, pendingPOs, recentGRNs] = await Promise.all([
      supabase.from('warehouse_lots').select('id, item_name, quantity_remaining, expiry_date, unit_cost_cents')
        .eq('business_id', business_id).eq('status', 'active')
        .lte('expiry_date', today30).gte('expiry_date', todayStr).gt('quantity_remaining', 0),
      supabase.from('warehouse_purchase_orders').select('id', { count: 'exact', head: true })
        .eq('business_id', business_id).in('status', ['draft', 'sent']),
      supabase.from('warehouse_grns').select('grn_number, total_lines')
        .eq('business_id', business_id).gte('created_at', sevenDaysAgo.toISOString()).limit(5),
    ]);
    const expiryValueCents = (expLots.data ?? []).reduce((s: number, l: any) => s + l.quantity_remaining * (l.unit_cost_cents ?? 0), 0);
    warehouseCtx = {
      expiring_lots_30d: (expLots.data ?? []).length,
      expiring_lot_names: (expLots.data ?? []).slice(0, 3).map((l: any) => l.item_name),
      expiry_value_at_risk_aud: (expiryValueCents / 100).toFixed(2),
      pending_pos: pendingPOs.count ?? 0,
      grns_this_week: (recentGRNs.data ?? []).length,
    };
  }

  const context = {
    business_name: business.name,
    industry: business.industry,
    city: business.city,
    lapsed_customers: lapsedCustomers.length,
    total_customers: customers.length,
    high_churn_count: highChurnCustomers.length,
    unanswered_reviews: unansweredReviews.count ?? 0,
    low_stock_items: lowStockItems.length,
    low_stock_names: lowStockItems.slice(0, 3).map(i => i.name),
    revenue_last_7_days_aud: (rev7 / 100).toFixed(2),
    revenue_prev_7_days_aud: (revPrev7 / 100).toFixed(2),
    revenue_trend_pct: revTrendPct,
    slowest_day: slowestDayName,
    winback_sent_recently: (recentWinbacks.count ?? 0) > 0,
    unread_competitor_alerts: unreadAlerts.count ?? 0,
    biggest_challenge: business.biggest_challenge,
    ...warehouseCtx,
  };

  // Claude — haiku for speed and cost
  const systemPrompt = `You are Aria, an AI business advisor for Australian small businesses.
Generate exactly 5 specific, actionable recommendations based on the business data provided.
Rules:
- Every recommendation MUST reference actual numbers from the data
- Use Australian English, A$ for currency
- Priority 'high' = act today, 'medium' = this week, 'low' = this month
- Never fabricate numbers not in the data
- Return ONLY a valid JSON array, no markdown, no preamble, no explanation
Each item must match this exact type:
{
  "id": "short-slug-001",
  "priority": "high"|"medium"|"low",
  "category": "customers"|"revenue"|"stock"|"reviews"|"marketing"|"compliance",
  "title": "max 8 words",
  "description": "max 30 words with specific numbers",
  "action_label": "max 4 words",
  "action_type": "winback"|"review_reply"|"promotion"|"reorder"|"campaign"|"navigate"|"dismiss",
  "action_payload": {},
  "metric": "headline number e.g. 14 or A$2,340",
  "metric_label": "e.g. lapsed 60+ days",
  "trend": "up"|"down"|"flat"|null
}`;

  let recommendations: unknown[] = [];
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(context) }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) recommendations = JSON.parse(match[0]);
  } catch {
    // Retry with simpler prompt
    try {
      const retry = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Return a JSON array of 3 business recommendations for: ${JSON.stringify(context)}. Format: [{id,priority,category,title,description,action_label,action_type,action_payload,metric,metric_label,trend}]`,
        }],
      });
      const raw = retry.content[0].type === 'text' ? retry.content[0].text : '';
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) recommendations = JSON.parse(match[0]);
    } catch { /* return empty */ }
  }

  // Upsert
  await supabase.from('daily_briefings').upsert({
    business_id,
    date: today,
    recommendations,
    data_snapshot: context,
    generated_at: new Date().toISOString(),
    dismissed_at: null,
    remind_at: null,
  }, { onConflict: 'business_id,date' });

  return NextResponse.json({
    recommendations,
    generated_at: new Date().toISOString(),
    data_snapshot: context,
    cached: false,
  });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, remind_in_hours } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const today = new Date().toISOString().split('T')[0];
  const update = remind_in_hours
    ? { remind_at: new Date(Date.now() + remind_in_hours * 3600 * 1000).toISOString() }
    : { dismissed_at: new Date().toISOString() };

  await supabase.from('daily_briefings').update(update).eq('business_id', business_id).eq('date', today);
  return NextResponse.json({ ok: true });
}
