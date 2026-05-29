import { parseLLMJsonOr } from '@/lib/ai-json';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { trackUsage } from '@/lib/track-usage';
import { getBusinessSales, getBusinessCustomers, getBusinessItems } from '@/lib/business-data';
import { NextRequest, NextResponse } from 'next/server';
import { getWeatherForecast, getUpcomingHolidays, getABSRetailBenchmarks, getRBAData } from '@/lib/external-apis';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { geminiFlash } from '@/lib/gemini'
import { checkGeminiRateLimit } from '@/lib/gemini-rate-limiter'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

async function fetchGeminiExternalContext(business: { city?: string | null; industry?: string | null }) {
  const location = (business.city as string | null) ?? 'Melbourne'
  const industry = (business.industry as string | null) ?? 'retail'
  try {
    const allowed = await checkGeminiRateLimit()
    if (!allowed) return null
    const prompt = `You are a business intelligence assistant. Search the web and provide a brief JSON summary for a ${industry} business in ${location}, Australia. Return ONLY valid JSON, no preamble:
{
  "local_news": "1-2 sentences of relevant local news or events in ${location} today",
  "industry_news": "1-2 sentences of Australian ${industry} industry news today",
  "weather_tomorrow": "brief weather description for ${location} tomorrow",
  "competitor_promos": "any detected promotions from major ${industry} competitors in Australia today, or null"
}`
    const result = await geminiFlash.generateContent(prompt)
    const text = result.response.text()
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return null
  }
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
    .select('id, name, owner_name, industry, city, monthly_revenue, staff_count, biggest_challenge, data_source, square_connected, requires_briefing_refresh')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  // If the DB flag says data changed since last briefing, treat as force_refresh
  const shouldRefresh = force_refresh || Boolean((business as { requires_briefing_refresh?: boolean }).requires_briefing_refresh)

  trackUsage({ business_id: business_id, event_type: 'daily_briefing' });

  const today = new Date().toISOString().split('T')[0];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  // Cache check — skip Claude if fresh enough
  if (!shouldRefresh) {
    const { data: cached } = await supabase
      .from('daily_briefings')
      .select('recommendations, generated_at, data_snapshot, dismissed_at, remind_at')
      .eq('business_id', business_id)
      .eq('date', today)
      .maybeSingle();

    const hasRecs = Array.isArray(cached?.recommendations) && cached.recommendations.length > 0
    if (cached && hasRecs && cached.generated_at > sixHoursAgo && !cached.dismissed_at) {
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
    geminiContext,
  ] = await Promise.all([
    getWeatherForecast(city).catch(() => []),
    Promise.resolve(getUpcomingHolidays(60, 'VIC')),
    getABSRetailBenchmarks().catch(() => null),
    getRBAData().catch(() => null),
    fetchGeminiExternalContext(business).catch(() => null),
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
    supabase.from('google_reviews').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).eq('has_reply', false)
      .gte('review_date', thirtyDaysAgo.toISOString()),
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

  // Continue even with no sales — Aria can still give setup recommendations
  const rev7 = sales7.reduce((s, x) => s + x.totalCents, 0);

  // Revenue calculations (rev7 already computed above)
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

  // Invoice intelligence — cash-flow visibility in the briefing.
  const { getInvoiceStats, hasInvoiceSignal } = await import('@/lib/aria/invoice-intelligence');
  const invoiceStats = await getInvoiceStats(supabase, business_id);

  // New bookings since yesterday + upcoming — public-form bookings must be visible.
  const nowIso = new Date().toISOString();
  const [{ data: newBookings }, { count: upcomingBookings }] = await Promise.all([
    supabase.from('bookings').select('customer_name, booking_date, source')
      .eq('business_id', business_id).gte('created_at', yesterdayStart.toISOString()).neq('status', 'cancelled'),
    supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).gte('booking_date', nowIso).neq('status', 'cancelled'),
  ]);
  const newBookingList = newBookings ?? [];
  const newFromPublic = newBookingList.filter(b => b.source && b.source !== 'manual').length;

  // Parcel tracking summary — in transit / delivered today / at risk of late arrival.
  const [{ data: activeParcels }, { count: parcelsDeliveredToday }] = await Promise.all([
    supabase.from('pos_parcel_tracking').select('status, predicted_late')
      .eq('business_id', business_id).not('status', 'in', '(delivered,cancelled,returned,lost)'),
    supabase.from('pos_parcel_tracking').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).gte('delivered_at', todayStart.toISOString()),
  ]);
  const parcelsInTransit = (activeParcels ?? []).length;
  const parcelsAtRisk = (activeParcels ?? []).filter(p => p.predicted_late).length;

  // Customer Inbox — unread messages + new demand signals worth flagging.
  const [{ count: inboxUnread }, { count: newDemandSignals }] = await Promise.all([
    supabaseAdmin.from('customer_interactions_v').select('id', { count: 'exact', head: true }).eq('business_id', business_id).eq('has_unread', true),
    supabaseAdmin.from('instore_demand_signals').select('id', { count: 'exact', head: true }).eq('business_id', business_id).gte('created_at', yesterdayStart.toISOString()),
  ]);

  // Loyalty counters (only meaningful once a program is configured).
  const { getLoyaltyStats, hasLoyaltySignal } = await import('@/lib/aria/loyalty-intelligence');
  const loyaltyStats = await getLoyaltyStats(supabaseAdmin, business_id);

  // Scan-and-Go usage today (does self-checkout move basket size?).
  const { data: sgCarts } = await supabaseAdmin.from('pos_self_checkout_carts')
    .select('subtotal_cents').eq('business_id', business_id).eq('status', 'redeemed').gte('redeemed_at', todayStart.toISOString());
  const sgCount = (sgCarts ?? []).length;
  const sgAvgCents = sgCount > 0 ? Math.round((sgCarts ?? []).reduce((n, c) => n + (c.subtotal_cents ?? 0), 0) / sgCount) : 0;
  const normalAvgCents = salesToday.length > 0 ? Math.round(revToday / salesToday.length) : 0;

  const context = {
    business_name: business.name,
    industry: business.industry,
    bookings_status: {
      new_since_yesterday: newBookingList.length,
      new_from_public_form: newFromPublic,
      upcoming_total: upcomingBookings ?? 0,
      newest: newBookingList.slice(0, 3).map(b => ({ customer: b.customer_name, date: b.booking_date, source: b.source })),
    },
    parcels_status: {
      in_transit: parcelsInTransit,
      delivered_today: parcelsDeliveredToday ?? 0,
      at_risk_of_late: parcelsAtRisk,
    },
    inbox_status: {
      unread_messages: inboxUnread ?? 0,
      new_demand_signals: newDemandSignals ?? 0,
    },
    loyalty_status: loyaltyStats.configured ? {
      members: loyaltyStats.members,
      new_members_30d: loyaltyStats.newMembers30d,
      points_outstanding: loyaltyStats.pointsOutstanding,
      redemptions_30d: loyaltyStats.redemptions30d,
    } : null,
    scan_and_go_status: sgCount > 0 ? {
      used_today: sgCount,
      avg_basket_aud: (sgAvgCents / 100).toFixed(2),
      normal_avg_basket_aud: (normalAvgCents / 100).toFixed(2),
    } : null,
    invoice_status: {
      outstanding_count: invoiceStats.pendingCount,
      outstanding_total_aud: invoiceStats.pendingTotal.toFixed(2),
      overdue_count: invoiceStats.overdueCount,
      overdue_total_aud: invoiceStats.overdueTotal.toFixed(2),
      overdue_oldest_days: invoiceStats.oldestDays,
      paid_30d_count: invoiceStats.paidCount,
      paid_30d_total_aud: invoiceStats.paidTotal.toFixed(2),
      drafts_unsent: invoiceStats.draftCount,
      top_overdue: invoiceStats.topOverdue
        ? { customer: invoiceStats.topOverdue.name, amount_aud: invoiceStats.topOverdue.amount.toFixed(2), days_late: invoiceStats.topOverdue.days }
        : null,
    },
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
    bank_context: await (async () => {
      const { data: bizBank } = await supabase.from('businesses').select('basiq_connected').eq('id', business_id).maybeSingle();
      if (!bizBank?.basiq_connected) return null;
      const { data: accts } = await supabase.from('bank_accounts').select('balance').eq('business_id', business_id).eq('is_active', true);
      const total = (accts ?? []).reduce((a, x) => a + Number(x.balance ?? 0), 0);
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      const { data: txns } = await supabase.from('bank_transactions').select('amount').eq('business_id', business_id).gte('transaction_date', weekAgo);
      const outflows = (txns ?? []).filter((t: { amount: number | null }) => Number(t.amount ?? 0) < 0).reduce((a, t: { amount: number | null }) => a + Math.abs(Number(t.amount ?? 0)), 0);
      return {
        current_balance_aud: Math.round(total * 100) / 100,
        weekly_outflows_aud: Math.round(outflows * 100) / 100,
        weeks_of_runway: outflows > 0 ? Math.round((total / outflows) * 10) / 10 : null,
      };
    })(),
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
      gemini_context: geminiContext ?? null,
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
    Number(warehouseCtx.pending_pos ?? 0) > 0 ||
    hasInvoiceSignal(invoiceStats) ||
    newBookingList.length > 0 ||
    parcelsAtRisk > 0 ||
    (inboxUnread ?? 0) > 0 ||
    (newDemandSignals ?? 0) > 0 ||
    hasLoyaltySignal(loyaltyStats) ||
    sgCount > 0;

  if (!hasActionableData) {
    await supabase.from('daily_briefings').upsert({
      business_id,
      date: today,
      recommendations: [],
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

  let recommendations: unknown[] = [];
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const dataStr = typeof context === 'string' ? context : JSON.stringify(context)
    const todayDate = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })

    const _resp = await trackAICall(
      { route: 'aria/daily-briefing', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'daily-briefing' },
      () => _anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: `You are Aria, a business intelligence engine for Australian small businesses. Output ONLY a valid JSON array. No markdown. No explanation. No text before or after the array.

Each item in the array must have these exact fields:
- id: string slug (e.g. "revenue-up-this-week")
- priority: "high" | "medium" | "low"
- category: "customers" | "revenue" | "stock" | "reviews" | "marketing" | "compliance" | "finance"
- title: string (max 8 words, specific)
- description: string (max 25 words, must include real numbers from the data)
- action_label: string (max 4 words)
- action_type: "winback" | "review_reply" | "promotion" | "reorder" | "campaign" | "navigate" | "dismiss"
- action_payload: {}
- metric: string (key number e.g. "A$2,340" or "12 customers")
- metric_label: string (e.g. "this week" or "at risk")
- trend: "up" | "down" | "flat" | null

Return 3-5 items. Use real numbers from the data. Do not invent data.`,
        messages: [{
          role: 'user',
          content: `Today: ${todayDate}
Business: ${business.name as string} (${business.industry as string ?? 'retail'}, Australia)

Business data:
${dataStr.slice(0, 3000)}

Generate 3-5 actionable briefing items from this real data. If invoice_status shows overdue invoices, you MUST include a high-priority "finance" item naming the top_overdue customer, amount and days late (e.g. "$X overdue from {customer} — {days} days late, chase today"). If bookings_status.new_since_yesterday > 0, include a "customers" item noting how many new bookings came in (call out new_from_public_form separately if any). If inbox_status.unread_messages > 0 or new_demand_signals > 0, include a "customers" item like "You have N unread customer messages and M new demand signals worth flagging — check your inbox". If scan_and_go_status is present, include a "revenue" item comparing its avg_basket_aud to normal_avg_basket_aud (e.g. "X scan-and-go checkouts today, avg basket $Y vs $Z normal"). JSON array only.`
        }]
      })
    )

    const raw = _resp.content[0].type === 'text' ? _resp.content[0].text.trim() : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    recommendations = parseLLMJsonOr<unknown[]>(cleaned, [], 'daily-briefing', 'array')
  } catch (e) {
    console.error('[daily-briefing] AI call failed:', (e as Error).message)
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

  // Reset stale flag now that briefing is fresh
  if (shouldRefresh) {
    void supabase.from('businesses').update({ requires_briefing_refresh: false }).eq('id', business_id)
  }

  // Audit trail: record that Aria flagged overdue invoices in this briefing.
  if (invoiceStats.overdueCount > 0) {
    void (async () => {
      try {
        await supabase.from('aria_action_log').insert({
          business_id,
          action_type: 'flag_overdue_invoices',
          entity_type: 'invoice',
          entity_ids: invoiceStats.overdueIds,
          triggered_by: 'aria_daily_briefing',
          message_excerpt: invoiceStats.topOverdue
            ? `$${invoiceStats.topOverdue.amount.toFixed(2)} overdue from ${invoiceStats.topOverdue.name} (${invoiceStats.topOverdue.days}d late) — ${invoiceStats.overdueCount} overdue total`
            : `${invoiceStats.overdueCount} overdue invoices flagged`,
          executed_at: new Date().toISOString(),
        });
      } catch { /* non-fatal */ }
    })();
  }

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
