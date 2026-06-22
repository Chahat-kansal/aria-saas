import { supabaseAdmin } from '@/lib/supabase-admin'
import { todayAEST, toAESTStart, startOfWeekAEST } from '@/lib/date-au'
import { computeStockValue } from '@/lib/inventory/stock-value'
import { velocitySummary } from '@/lib/inventory/velocity'

export interface ConversationSummary {
  id: string
  title: string | null
  last_message_at: string
  message_count: number
  last_intent: string | null
}

export type ContextScope = 'quick' | 'standard' | 'full'

export interface AskAriaContext {
  business_id: string
  business_name: string
  industry: string
  city: string | null
  address: string | null
  phone: string | null
  abn: string | null
  google_rating: number | null
  google_reviews: number | null
  owner_name: string | null
  currency: string
  // Revenue snapshots
  revenue_today_cents: number
  revenue_week_cents: number
  revenue_month_cents: number
  avg_ticket_cents: number
  // Operational state
  low_stock_items: Array<{ id: string; name: string; qty: number; reorder_point: number | null }>
  // INV-COST-1 — real stock valuation (GROUNDING: unknown-cost products excluded from at_cost + counted)
  inventory_value: { at_cost_cents: number; at_retail_cents: number; products_valued: number; products_unknown_cost: number; margin_incomplete: boolean } | null
  // INV-VELOCITY-1 — real velocity from completed sales (top movers, dead stock, ABC counts, cost-honesty flag)
  inventory_velocity: { scored_at: string | null; top_movers: Array<{ name: string; units_per_day: number; abc_tier: string }>; dead_stock: Array<{ name: string }>; abc_counts: { A: number; B: number; C: number; dead: number }; uncosted_count: number } | null
  staff_count: number
  open_support_tickets: number
  pending_aria_actions: number
  // Self-state grounding — canonical recommendation data.
  // THREE action tables exist; this field uses the canonical one:
  //   aria_actions          — primary queue (235+ pending for Sip); UI: Autopilot/Brain panel
  //   aria_autopilot_actions — secondary lighter table (~1 pending); UI: aria-os/status, inbox, wins
  //   aria_action_log        — immutable audit trail (action-executor writes, action-rollback reads)
  aria_actions_detail: {
    pending_count: number
    executed_count: number
    top_pending: Array<{
      title: string
      category: string | null
      priority: string | null
      recommendation: string | null
      expected_impact: string | null
      created_at: string
    }>
  } | null
  // Conversation memory
  conversation_history: Array<{ role: string; content: string }>
  recent_conversations: ConversationSummary[]
  // Fresh signals from monitoring engine
  fresh_signals: Array<{ signal_type: string; payload: Record<string, unknown>; created_at: string }>
  // Distilled memories from prior conversations
  memories: Array<{ id: string; kind: string; content: string; topic: string | null; importance: number }>
  // Per-category advice confidence weights from outcome learning
  advice_weights: Record<string, number>
  competitor_intelligence: Array<{ name: string; last_checked: string | null; data: unknown }>
  prediction: { today_predicted: number; tomorrow_predicted: number; today_dow: string; tomorrow_dow: string; pattern: Record<string, number> }
  // Pre-loaded top data (avoids tool calls for common questions)
  top_products_month: Array<{ name: string; revenue: number; qty: number }>
  top_customers_alltime: Array<{ name: string; total_spent: number; visits: number }>
  recent_transactions: Array<{ amount: number; payment_method: string; created_at: string; items_count: number }>
  staff_on_shift_today: Array<{ name: string; role: string; hours: number }>
  pending_purchase_orders: Array<{ supplier: string; total: number; expected_date: string | null }>
  loyalty_stats: { total_members: number; active_last_30d: number; points_outstanding: number }
  monthly_comparison: { this_month: number; last_month: number; change_pct: number }
  busiest_hour: { hour: string; avg_revenue: number }
  avg_daily_revenue: number
  subscription_tier: string | null
  council_plan: { narrative: string | null; projected_revenue_impact: number } | null
  bas_current_quarter: { period_start: string; period_end: string; due_date: string; status: string; net_gst: number | null; w2_payg: number | null } | null
}

export async function buildAskAriaContext(
  businessId: string,
  conversationId?: string,
  scope: ContextScope = 'standard',
): Promise<AskAriaContext> {
  const isQuick = scope === 'quick'
  const now = new Date()
  // TZ-1: AEST-midnight boundaries via date-au (true instants with +10:00 offset)
  const todayStartIso = toAESTStart(todayAEST())
  const monthStartIso = toAESTStart(todayAEST().slice(0, 7) + '-01')
  const [tzYear, tzMonth] = todayAEST().slice(0, 7).split('-').map(Number)
  const lastMonthStartIso = toAESTStart(`${tzMonth === 1 ? tzYear - 1 : tzYear}-${String(tzMonth === 1 ? 12 : tzMonth - 1).padStart(2, '0')}-01`)
  // WEEK-1: "this week" = calendar week, Monday 00:00 AEST → now (was rolling 7 days)
  const weekStart = new Date(toAESTStart(startOfWeekAEST().toISOString().slice(0, 10)))
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30)

  const competitorRes = supabaseAdmin
    .from('aria_competitor_watches')
    .select('competitor_name, last_checked_at, competitor_data')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('last_checked_at', { ascending: false })
    .limit(3)

  const [
    bizRes, salesTodayRes, salesWeekRes, salesMonthRes, lowStockRes, staffRes, ticketsRes, actionsRes, convHistRes, recentConvsRes, competitorsRes,
    saleItemsRes, topCustomersRes, recentTxnsRes, pendingPOsRes, loyaltyRes, activeCustomersRes, lastMonthSalesRes, subscriptionRes,
    actionsExecutedRes,
  ] = await Promise.all([
    supabaseAdmin.from('businesses').select('name,industry,owner_name,city,address,phone,abn,google_average_rating,google_total_reviews').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', todayStartIso).neq('status', 'voided'),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', weekStart.toISOString()).neq('status', 'voided'),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', monthStartIso).neq('status', 'voided'),
    supabaseAdmin.from('pos_outlet_inventory').select('id,product_id,items_on_hand,items_reorder_level,pos_products(name)').eq('business_id', businessId).lt('items_on_hand', 5).limit(10),
    supabaseAdmin.from('pos_users').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'open'),
    // Fetch top pending items + count for self-state grounding (canonical recommendations table)
    supabaseAdmin.from('aria_actions').select('id, title, category, priority, recommendation, expected_impact, created_at', { count: 'exact' }).eq('business_id', businessId).eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
    conversationId
      ? supabaseAdmin.from('aria_conversations').select('messages').eq('id', conversationId).eq('business_id', businessId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('aria_conversations').select('id,title,last_message_at,message_count,last_intent').eq('business_id', businessId).order('last_message_at', { ascending: false }).limit(10),
    competitorRes,
    // Top products this month (via sale items join)
    supabaseAdmin.from('pos_sale_items')
      .select('product_name, line_total, quantity, pos_sales!inner(business_id, status, created_at)')
      .eq('pos_sales.business_id', businessId)
      .neq('pos_sales.status', 'voided')
      .gte('pos_sales.created_at', monthStartIso)
      .limit(500),
    // Top customers by total spent
    supabaseAdmin.from('pos_customers')
      .select('name, total_spent, visit_count')
      .eq('business_id', businessId)
      .order('total_spent', { ascending: false })
      .limit(5),
    // Recent 10 transactions
    supabaseAdmin.from('pos_sales')
      .select('total_amount, payment_method, created_at')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .limit(10),
    // Pending purchase orders
    supabaseAdmin.from('pos_purchase_orders')
      .select('supplier_name, total_amount, expected_delivery_date')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .limit(5),
    // Loyalty stats — all customers with loyalty_points
    supabaseAdmin.from('pos_customers')
      .select('loyalty_points', { count: 'exact' })
      .eq('business_id', businessId),
    // Active customers last 30 days
    supabaseAdmin.from('pos_customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('last_visit', thirtyDaysAgo.toISOString()),
    // Last month sales for comparison
    supabaseAdmin.from('pos_sales')
      .select('total_amount')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .gte('created_at', lastMonthStartIso)
      .lt('created_at', monthStartIso),
    // Subscription tier
    supabaseAdmin.from('business_subscriptions')
      .select('tier')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .maybeSingle(),
    // Executed aria_actions count (for self-state grounding: "X executed, Y pending")
    supabaseAdmin.from('aria_actions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'executed'),
  ])

  const biz = bizRes.data
  const sumCents = (rows: Array<{ total_amount: number | null }> | null) =>
    (rows ?? []).reduce((s, r) => s + Math.round((Number(r.total_amount) || 0) * 100), 0)

  const todayCents = sumCents(salesTodayRes.data)
  const weekCents = sumCents(salesWeekRes.data)
  const monthCents = sumCents(salesMonthRes.data)
  const salesCount = (salesMonthRes.data ?? []).length
  const avgTicket = salesCount > 0 ? Math.round(monthCents / salesCount) : 0
  console.log('[aria/context] month_revenue_cents', monthCents, 'rows', salesCount, 'business', businessId)

  const lowStock = (lowStockRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.product_id ?? r.id),
    name: String((r.pos_products as Record<string,unknown> | null)?.name ?? 'Unknown'),
    qty: Number(r.items_on_hand) || 0,
    reorder_point: r.items_reorder_level != null ? Number(r.items_reorder_level) : null,
  }))

  const convHistory: Array<{ role: string; content: string }> = (() => {
    const msgs = convHistRes.data?.messages
    if (!Array.isArray(msgs)) return []
    return (msgs as Array<{ role: string; content: string }>).slice(-20)
  })()

  const recentConvs: ConversationSummary[] = (recentConvsRes.data ?? []).map((r: Record<string,unknown>) => ({
    id: String(r.id),
    title: r.title ? String(r.title) : null,
    last_message_at: String(r.last_message_at),
    message_count: Number(r.message_count) || 0,
    last_intent: r.last_intent ? String(r.last_intent) : null,
  }))

  // ── Process new deep context fields ──────────────────────────────────────

  // Top products this month — aggregate by product_name
  const productMap: Record<string, { name: string; revenue: number; qty: number }> = {}
  for (const item of (saleItemsRes.data ?? []) as Array<{ product_name: string | null; line_total: number | null; quantity: number | null }>) {
    const name = item.product_name ?? 'Unknown'
    if (!productMap[name]) productMap[name] = { name, revenue: 0, qty: 0 }
    productMap[name].revenue += Number(item.line_total ?? 0)
    productMap[name].qty += Number(item.quantity ?? 1)
  }
  const topProductsMonth = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }))

  // Top customers all-time (canonical: pos_customers.total_spent DESC — NOT a period window)
  const topCustomersAllTime = (topCustomersRes.data ?? []).map((c: Record<string, unknown>) => ({
    name: String(c.name ?? 'Unknown'),
    total_spent: Number(c.total_spent ?? 0),
    visits: Number(c.visit_count ?? 0),
  }))

  // Recent transactions
  const recentTransactions = (recentTxnsRes.data ?? []).map((t: Record<string, unknown>) => ({
    amount: Number(t.total_amount ?? 0),
    payment_method: String(t.payment_method ?? 'unknown'),
    created_at: String(t.created_at ?? ''),
    items_count: 0,
  }))

  // Pending purchase orders
  const pendingPOs = (pendingPOsRes.data ?? []).map((o: Record<string, unknown>) => ({
    supplier: String(o.supplier_name ?? 'Unknown'),
    total: Number(o.total_amount ?? 0),
    expected_date: o.expected_delivery_date ? String(o.expected_delivery_date) : null,
  }))

  // Loyalty stats
  const loyaltyRows = (loyaltyRes.data ?? []) as Array<{ loyalty_points: number | null }>
  const totalMembers = loyaltyRes.count ?? loyaltyRows.length
  const pointsOutstanding = loyaltyRows.reduce((s, r) => s + Number(r.loyalty_points ?? 0), 0)
  const activeCustomersCount = activeCustomersRes.count ?? 0
  const loyaltyStats = {
    total_members: totalMembers,
    active_last_30d: activeCustomersCount,
    points_outstanding: pointsOutstanding,
  }

  // Monthly comparison (in cents)
  const lastMonthCents = sumCents(lastMonthSalesRes.data)
  const rawChangePct = lastMonthCents > 0 ? ((monthCents - lastMonthCents) / lastMonthCents) * 100 : 0
  const monthlyComparison = {
    this_month: monthCents,
    last_month: lastMonthCents,
    change_pct: Math.round(rawChangePct * 10) / 10,
  }

  // Avg daily revenue (dollars)
  const daysElapsed = Math.max(1, now.getDate())
  const avgDailyRevenue = (monthCents / 100) / daysElapsed

  // Subscription tier
  const subscriptionTier = (subscriptionRes.data as { tier?: string } | null)?.tier ?? null

  // ── Build self-state grounding block (aria_actions = canonical recommendation table) ──
  const ariaActionsDetail = {
    pending_count:  Number(actionsRes.count) || 0,
    executed_count: Number(actionsExecutedRes.count) || 0,
    top_pending: ((actionsRes.data ?? []) as Array<Record<string, unknown>>).map(a => ({
      title:            String(a.title ?? ''),
      category:         a.category        ? String(a.category)        : null,
      priority:         a.priority        ? String(a.priority)        : null,
      recommendation:   a.recommendation  ? String(a.recommendation).slice(0, 200) : null,
      expected_impact:  a.expected_impact ? String(a.expected_impact) : null,
      created_at:       String(a.created_at ?? ''),
    })),
  }

  // ── Fetch current BAS quarter draft (non-blocking, best-effort) ──────────
  const { data: basRow } = isQuick ? { data: null } : await supabaseAdmin
    .from('bas_drafts')
    .select('period_start,period_end,due_date,status,net_gst,w2_payg_withholding')
    .eq('business_id', businessId)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(r => r, () => ({ data: null }))

  const basCurrentQuarter = basRow ? {
    period_start: String(basRow.period_start),
    period_end: String(basRow.period_end),
    due_date: String(basRow.due_date),
    status: String(basRow.status),
    net_gst: basRow.net_gst != null ? Number(basRow.net_gst) : null,
    w2_payg: basRow.w2_payg_withholding != null ? Number(basRow.w2_payg_withholding) : null,
  } : null

  // ── Fetch today's council plan_narrative (non-blocking) ──────────────────
  const todayStr = new Date().toISOString().split('T')[0]
  const { data: councilRow } = isQuick ? { data: null } : await supabaseAdmin
    .from('agent_council_sessions')
    .select('plan_narrative, projected_revenue_impact')
    .eq('business_id', businessId)
    .eq('session_date', todayStr)
    .eq('status', 'complete')
    .maybeSingle()
    .then(r => r, () => ({ data: null }))

  // ── Fetch fresh signals separately (non-blocking, best-effort) ─────────
  const { data: signalRows } = await supabaseAdmin
    .from('aria_signal_cache')
    .select('signal_type,payload,created_at')
    .eq('business_id', businessId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
    .then(r => r, () => ({ data: null }))

  // Fetch advice weights from outcome learning (non-blocking)
  const { data: weightRows } = await supabaseAdmin
    .from('aria_advice_weights')
    .select('category,weight')
    .eq('business_id', businessId)
    .then(r => r, () => ({ data: null }))

  const adviceWeights: Record<string, number> = {}
  for (const w of (weightRows ?? []) as Array<{ category: string; weight: number }>) {
    adviceWeights[w.category] = Number(w.weight)
  }

  // Fetch top memories by importance (non-blocking, best-effort)
  const { data: memoryRows } = await supabaseAdmin
    .from('aria_business_memory')
    .select('id,kind,content,topic,importance')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('importance', { ascending: false })
    .order('confidence', { ascending: false })
    .limit(15)
    .then(r => r, () => ({ data: null }))

  // Mark as referenced — fire-and-forget
  if (memoryRows && memoryRows.length > 0) {
    void (async () => {
      try {
        const ids = memoryRows.map((m: { id: string }) => m.id)
        await supabaseAdmin
          .from('aria_business_memory')
          .update({ last_referenced_at: new Date().toISOString() })
          .in('id', ids)
      } catch (e) { console.error('[business-context] memory last_referenced_at update failed:', e) }
    })()
  }

  // Sales prediction — last 30 days pattern by day of week + busiest hour (skip on quick)
  const { data: salesPattern } = isQuick ? { data: null } : await supabaseAdmin
    .from('pos_sales')
    .select('total_amount, created_at')
    .eq('business_id', businessId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(200)

  // Group revenue by day-of-week and individual date so we can compute avg daily revenue per DOW
  // (not avg transaction value — 6 Fridays vs 5 Sundays must be normalised)
  const dayRevByDate: Record<number, Record<string, number>> = {}
  const hourRevByDate: Record<number, Record<string, number>> = {}
  for (const s of salesPattern ?? []) {
    const d = new Date(String(s.created_at))
    const day = d.getDay()
    const hour = d.getHours()
    const dateStr = String(s.created_at).slice(0, 10)
    const amt = Number(s.total_amount) || 0
    if (!dayRevByDate[day]) dayRevByDate[day] = {}
    dayRevByDate[day][dateStr] = (dayRevByDate[day][dateStr] ?? 0) + amt
    if (!hourRevByDate[hour]) hourRevByDate[hour] = {}
    hourRevByDate[hour][dateStr] = (hourRevByDate[hour][dateStr] ?? 0) + amt
  }

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const todayDow = now.getDay()
  const tomorrowDow = (todayDow + 1) % 7
  const avgDailyForDow = (dow: number) => {
    const dateMap = dayRevByDate[dow]
    if (!dateMap) return 0
    const vals = Object.values(dateMap)
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }
  const todayAvg = avgDailyForDow(todayDow)
  const tomorrowAvg = avgDailyForDow(tomorrowDow)
  const prediction = {
    today_predicted: Math.round(todayAvg),
    tomorrow_predicted: Math.round(tomorrowAvg),
    today_dow: dayNames[todayDow],
    tomorrow_dow: dayNames[tomorrowDow],
    pattern: Object.fromEntries(
      Object.entries(dayRevByDate).map(([day, dateMap]) => {
        const vals = Object.values(dateMap)
        return [dayNames[Number(day)], Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)]
      })
    ),
  }

  // Compute busiest hour from sales pattern — avg daily revenue at each hour
  let busiestHour = { hour: 'unknown', avg_revenue: 0 }
  for (const [hr, dateMap] of Object.entries(hourRevByDate)) {
    const vals = Object.values(dateMap)
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    if (avg > busiestHour.avg_revenue) {
      const h = Number(hr)
      const ampm = h >= 12 ? 'pm' : 'am'
      const h12 = h % 12 === 0 ? 12 : h % 12
      busiestHour = { hour: h12 + ampm, avg_revenue: Math.round(avg * 100) / 100 }
    }
  }

  // INV-COST-1 — real stock valuation for groundTruth (unknown-cost products excluded + counted).
  let inventoryValue: AskAriaContext['inventory_value'] = null
  try {
    const sv = await computeStockValue(supabaseAdmin, businessId, null)
    inventoryValue = {
      at_cost_cents: Math.round(sv.at_cost * 100),
      at_retail_cents: Math.round(sv.at_retail * 100),
      products_valued: sv.products_valued,
      products_unknown_cost: sv.products_unknown_cost,
      margin_incomplete: sv.margin_incomplete,
    }
  } catch (e) { console.error('[business-context] stock value failed (non-fatal):', (e as Error).message) }

  // INV-VELOCITY-1 — real velocity signals for groundTruth (never guessed; cost-honesty flag carried).
  let inventoryVelocity: AskAriaContext['inventory_velocity'] = null
  try {
    const vs = await velocitySummary(supabaseAdmin, businessId)
    inventoryVelocity = { scored_at: vs.scored_at, top_movers: vs.top_movers, dead_stock: vs.dead_stock, abc_counts: vs.counts, uncosted_count: vs.uncosted }
  } catch (e) { console.error('[business-context] velocity summary failed (non-fatal):', (e as Error).message) }

  return {
    business_id: businessId,
    business_name: biz?.name ?? 'Your business',
    industry: biz?.industry ?? 'retail',
    owner_name: biz?.owner_name ?? null,
    city: (biz as any)?.city ?? null,
    address: (biz as any)?.address ?? null,
    phone: (biz as any)?.phone ?? null,
    abn: (biz as any)?.abn ?? null,
    google_rating: (biz as any)?.google_average_rating ?? null,
    google_reviews: (biz as any)?.google_total_reviews ?? null,
    currency: 'AUD',
    revenue_today_cents: todayCents,
    revenue_week_cents: weekCents,
    revenue_month_cents: monthCents,
    avg_ticket_cents: avgTicket,
    low_stock_items: lowStock,
    inventory_value: inventoryValue,
    inventory_velocity: inventoryVelocity,
    staff_count: Number(staffRes.count) || 0,
    open_support_tickets: Number(ticketsRes.count) || 0,
    pending_aria_actions: ariaActionsDetail.pending_count,
    aria_actions_detail: ariaActionsDetail,
    conversation_history: convHistory,
    recent_conversations: recentConvs,
    fresh_signals: (signalRows ?? []) as Array<{ signal_type: string; payload: Record<string, unknown>; created_at: string }>,
    memories: (memoryRows ?? []) as Array<{ id: string; kind: string; content: string; topic: string | null; importance: number }>,
    advice_weights: adviceWeights,
    competitor_intelligence: (competitorsRes.data ?? []).map((c: Record<string, unknown>) => ({
      name: String(c.competitor_name ?? ''),
      last_checked: c.last_checked_at ? String(c.last_checked_at) : null,
      data: c.competitor_data ?? null,
    })),
    prediction,
    top_products_month: topProductsMonth,
    top_customers_alltime: topCustomersAllTime,
    recent_transactions: recentTransactions,
    staff_on_shift_today: [],
    pending_purchase_orders: pendingPOs,
    loyalty_stats: loyaltyStats,
    monthly_comparison: monthlyComparison,
    busiest_hour: busiestHour,
    avg_daily_revenue: avgDailyRevenue,
    subscription_tier: subscriptionTier,
    council_plan: councilRow ? {
      narrative: councilRow.plan_narrative ?? null,
      projected_revenue_impact: Number(councilRow.projected_revenue_impact ?? 0),
    } : null,
    bas_current_quarter: basCurrentQuarter,
  }
}
