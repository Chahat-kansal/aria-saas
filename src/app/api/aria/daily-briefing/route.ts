import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { trackUsage } from '@/lib/track-usage';
import { getBusinessSales, getBusinessCustomers, getBusinessItems } from '@/lib/business-data';
import { NextRequest, NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { getWeatherForecast, getUpcomingHolidays, getABSRetailBenchmarks, getRBAData } from '@/lib/external-apis';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Simple in-memory rate limit — 6 req/min per IP. Resets per minute.
// Module-level map survives across warm invocations in the same lambda instance.
const _ipBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = _ipBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    _ipBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= 6) return false;
  bucket.count++;
  return true;
}

async function _POST(req: NextRequest) {
  // Rate limit BEFORE auth — cheap guard against retry storms
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, force_refresh } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // Verify ownership + get business details
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, owner_name, industry, city, monthly_revenue, staff_count, biggest_challenge, data_source, square_connected')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  trackUsage({ business_id: business_id, event_type: 'daily_briefing' });

  const today = new Date().toISOString().split('T')[0];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
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

  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString();

  // Fetch external context in parallel with business data
  const city = (business.city as string | null) ?? 'Melbourne';
  const [
    weatherForecast,
    upcomingHolidays,
    absData,
    rbaData,
  ] = await Promise.all([
    getWeatherForecast(city).catch(() => []),
    Promise.resolve(getUpcomingHolidays(60, 'VIC')),
    getABSRetailBenchmarks().catch(() => null),
    getRBAData().catch(() => null),
  ]);

  const [
    sales7,
    salesPrev7,
    sales14daily,
    customers,
    items,
    unansweredReviews,
    recentWinbacks,
    unreadAlerts,
    staffVisaExpiring,
    staffRtwUnverified,
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
    supabase.from('staff_members')
      .select('first_name, last_name, visa_expiry_date, visa_type')
      .eq('business_id', business_id)
      .eq('status', 'active')
      .lte('visa_expiry_date', in30Days)
      .not('visa_type', 'in', '("Australian Citizen","Permanent Resident")')
      .not('visa_expiry_date', 'is', null),
    supabase.from('staff_members')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .eq('status', 'active')
      .eq('right_to_work_verified', false),
  ]);

  // Revenue calculations
  const rev7     = sales7.reduce((s, x) => s + x.totalCents, 0);
  const revPrev7 = salesPrev7.reduce((s, x) => s + x.totalCents, 0);
  const revTrendPct = revPrev7 > 0 ? Math.round(((rev7 - revPrev7) / revPrev7) * 100) : 0;
  const salesToday = sales14daily.filter(s => s.soldAt >= todayStart);
  const salesYesterday = sales14daily.filter(s => s.soldAt >= yesterdayStart && s.soldAt < todayStart);
  const revToday = salesToday.reduce((s, x) => s + x.totalCents, 0);
  const revYesterday = salesYesterday.reduce((s, x) => s + x.totalCents, 0);
  const costByItemId = new Map(items.map(i => [i.id, i.costCents]));
  const grossProfitTodayCents = salesToday.reduce((sum, sale) => {
    return sum + sale.lineItems.reduce((lineSum, li) => {
      const costCents = li.costCents || costByItemId.get(li.itemId) || 0;
      if (!costCents) return lineSum;
      return lineSum + (li.priceCents - costCents) * li.quantity;
    }, 0);
  }, 0);

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
    data_source: dataSource,
    pos_connected: Boolean(business.square_connected || dataSource === 'aria_pos' || dataSource === 'square'),
    sales_count_7_days: sales7.length,
    sales_count_14_days: sales14daily.length,
    product_count: items.length,
    inventory_item_count: items.filter(i => i.currentStock > 0 || i.reorderPoint > 0).length,
    latest_sale_at: sales14daily[0]?.soldAt?.toISOString() ?? null,
    sales_today_aud: (revToday / 100).toFixed(2),
    sales_yesterday_aud: (revYesterday / 100).toFixed(2),
    gross_profit_today_aud: grossProfitTodayCents > 0 ? (grossProfitTodayCents / 100).toFixed(2) : null,
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
    visa_alerts: (staffVisaExpiring.data ?? []).length,
    visa_alert_names: (staffVisaExpiring.data ?? []).map((s: any) => `${s.first_name} ${s.last_name}`),
    unverified_rtw: staffRtwUnverified.count ?? 0,
    ...warehouseCtx,
    external_context: {
      weather_next_3_days: weatherForecast.slice(0, 3).map(d => ({
        date: d.date,
        weather: d.weather,
        temp_max: d.temp_max,
        stock_uplift_categories: d.stock_uplift_categories,
      })),
      upcoming_holidays: upcomingHolidays.slice(0, 3).map(h => ({
        name: h.name,
        days_away: h.days_away,
        impact_multiplier: h.impact,
      })),
      abs_retail_growth_pct: absData?.monthly_retail_turnover_growth_pct ?? null,
      abs_cpi_pct: absData?.cpi_annual_pct ?? null,
      rba_cash_rate_pct: rbaData?.cash_rate_pct ?? null,
      rba_outlook: rbaData?.economic_outlook ?? null,
    },
  };

  const hasActionableData =
    sales14daily.length > 0 ||
    items.length > 0 ||
    customers.length > 0 ||
    lowStockItems.length > 0 ||
    (unansweredReviews.count ?? 0) > 0 ||
    (unreadAlerts.count ?? 0) > 0 ||
    (staffVisaExpiring.data ?? []).length > 0 ||
    (staffRtwUnverified.count ?? 0) > 0 ||
    Number(warehouseCtx.expiring_lots_30d ?? 0) > 0 ||
    Number(warehouseCtx.pending_pos ?? 0) > 0;

  if (!hasActionableData) {
    await supabase.from('daily_briefings').upsert({
      business_id,
      date: today,
      recommendations: [],
      content: null,
      data_snapshot: context,
      generated_at: new Date().toISOString(),
      dismissed_at: null,
      remind_at: null,
    }, { onConflict: 'business_id,date' });

    return NextResponse.json({
      recommendations: [],
      generated_at: new Date().toISOString(),
      data_snapshot: context,
      cached: false,
      no_data: true,
      no_data_message: 'No connected sales, product, inventory, customer, supplier, or compliance data found yet.',
    });
  };

  // Claude — haiku for speed and cost
  const systemPrompt = `${ARIA_VOICE}

Generate exactly 5 specific, actionable recommendations based on the business data provided.
Rules:
- Every recommendation MUST reference actual numbers from the data
- Use Australian English, A$ for currency
- Priority 'high' = act today, 'medium' = this week, 'low' = this month
- Never fabricate numbers not in the data
- Return ONLY a valid JSON array, no markdown, no preamble, no explanation
- If external_context.upcoming_holidays has items, factor holiday uplift into stock/revenue recs
- If external_context.weather_next_3_days shows hot weather, mention beer/cold drink stock opportunity
- If visa_alerts > 0, this is HIGH PRIORITY — visa expiry for staff is a legal compliance issue. Name the staff member(s) with expiry date.
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
    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg = 
await trackAICall({ route: 'aria/daily-briefing', model: 'claude-sonnet-4-6', businessId: business_id, purpose: 'daily-briefing' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(context) }],
    }));
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) recommendations = JSON.parse(match[0]);
  } catch {
    // Retry with simpler prompt
    try {
      const retry = await trackAICall({ route: 'aria/daily-briefing', model: 'claude-sonnet-4-6', businessId: business_id, purpose: 'daily-briefing' }, () => anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Return a JSON array of 3 business recommendations for: ${JSON.stringify(context)}. Format: [{id,priority,category,title,description,action_label,action_type,action_payload,metric,metric_label,trend}]`,
        }],
      }));
      const raw = retry.content[0].type === 'text' ? retry.content[0].text : '';
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) recommendations = JSON.parse(match[0]);
    } catch { /* return empty */ }
  }

  // Build plain-text content from recommendations for display in content column
  const briefingContent = Array.isArray(recommendations) && recommendations.length > 0
    ? (recommendations as Array<{ priority?: string; title?: string; description?: string }>)
        .map(r => `[${(r.priority ?? 'info').toUpperCase()}] ${r.title ?? ''}: ${r.description ?? ''}`)
        .join('\n\n')
    : null;

  // Upsert
  await supabase.from('daily_briefings').upsert({
    business_id,
    date: today,
    recommendations,
    content: briefingContent,
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

async function _PATCH(req: NextRequest) {
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

export const POST = withErrorCapture('aria/daily-briefing', _POST)
export const PATCH = withErrorCapture('aria/daily-briefing', _PATCH)
