export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getAdminClient, isAdminEmail } from '@/lib/admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { loadCostModelData, computeFullCogsPerBusinessPerDay } from '@/lib/cost-model'
import { USD_PER_AUD } from '@/lib/fx-rate'

// COST-LEDGER-1 — the unified admin cost page's data source.
//
// ROLLUP REPAIR DECISION (sprint item 5): aria_daily_spend is missing 8 of 15 audited days
// (AI-COST-AUDIT-1 finding) because it's fed by an app-code RPC call (track_aria_spend) that only
// one caller (src/app/api/aria/ask/route.ts) invokes, using hardcoded ESTIMATED costs rather than
// real ones. Fixing those writes would still only ever cover ask/route.ts's chat-tool-loop activity,
// not the full ledger. Instead, this route computes every aggregate directly from the ledgers
// themselves (v_ai_costs / aria_ai_calls / cost_events), which are the actual source of truth and
// are correctly indexed (idx_cost_events_category_created, idx_cost_events_business_created) for
// this. aria_daily_spend / aria_monthly_spend / cost-guard.ts are left exactly as they are
// (extend-never-remove) — they still serve their original purpose (per-request budget gating in
// ask/route.ts), they're just not this page's data source.

type Category = 'ai' | 'sms' | 'email' | 'payment_fee' | 'infra' | 'other'

const PLAN_PRICES_AUD: Record<string, number> = { starter: 59, growth: 129, pro: 249, autonomous: 249 }

function ymOf(d: Date) { return d.toISOString().slice(0, 7) }
function monthStartOf(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) }

// Cron-triggered AI agent_keys, for the "chat vs cron" split. Everything not listed here defaults
// to "chat" (interactive/user- or dashboard-triggered) — the safer default given the audit's own
// finding that ~87.5% of measured AI burn is genuinely chat-driven, not automated.
const CRON_AGENT_KEY_PREFIXES = [
  'hypothesis_engine', 'bas_compliance', 'clv', 'weekly_promos', 'inventory_financing',
  'daily_briefing', 'market_price', 'parcel_insight', 'aeo_monitor', 'customer_acquisition',
]
function isCronAgentKey(agentKey: string | null): boolean {
  if (!agentKey) return false
  return CRON_AGENT_KEY_PREFIXES.some(p => agentKey.startsWith(p))
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getAdminClient()
  const { searchParams } = new URL(req.url)
  const venuesParam = searchParams.get('venues')

  const now = new Date()
  const monthStart = monthStartOf(now)
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const todayKey = now.toISOString().slice(0, 10)

  const [
    { data: aiThisMonth }, { data: aiLastMonth },
    { data: nonAiThisMonth }, { data: nonAiLastMonth },
    { data: businesses }, { data: activeSubs }, { data: renewals }, { data: anthropicTopups },
  ] = await Promise.all([
    db.from('v_ai_costs').select('business_id, reference_id, provider, amount_usd_cents, created_at, metadata').gte('created_at', monthStart.toISOString()).limit(50_000),
    db.from('v_ai_costs').select('amount_usd_cents').gte('created_at', lastMonthStart.toISOString()).lt('created_at', monthStart.toISOString()).limit(50_000),
    db.from('cost_events').select('business_id, category, provider, amount_usd_cents, created_at').neq('category', 'ai').gte('created_at', monthStart.toISOString()).limit(50_000),
    db.from('cost_events').select('category, amount_usd_cents').neq('category', 'ai').gte('created_at', lastMonthStart.toISOString()).lt('created_at', monthStart.toISOString()).limit(50_000),
    db.from('businesses').select('id, name, plan').eq('is_active', true),
    db.from('cost_subscriptions').select('id, provider, plan_name, amount_usd_cents, billing_cadence, category').eq('active', true),
    db.from('cost_subscriptions').select('id, provider, plan_name, amount_usd_cents, renewal_date, category').eq('active', true).not('renewal_date', 'is', null).gte('renewal_date', todayKey).lte('renewal_date', sixtyDaysOut).order('renewal_date', { ascending: true }),
    db.from('cost_subscriptions').select('amount_usd_cents').eq('active', true).eq('provider', 'Anthropic').eq('category', 'ai'),
  ])

  const activeBusinessCount = Math.max(1, (businesses ?? []).length)
  const nameOf = new Map((businesses ?? []).map(b => [b.id as string, b.name as string]))
  const planOf = new Map((businesses ?? []).map(b => [b.id as string, (b.plan as string | null) ?? 'starter']))

  // ── Fixed costs this month, normalized (monthly=as-is, yearly=/12, one_time excluded from the
  // recurring monthly total — a one_time Anthropic top-up isn't a recurring cost, it's reconciled
  // separately below as prepaid credit) ──
  let fixedThisMonthCents = 0
  for (const s of activeSubs ?? []) {
    const amt = (s.amount_usd_cents as number) ?? 0
    if (s.billing_cadence === 'monthly') fixedThisMonthCents += amt
    else if (s.billing_cadence === 'yearly') fixedThisMonthCents += amt / 12
  }
  const fixedPerBusinessPerMonthCents = fixedThisMonthCents / activeBusinessCount

  // ── Category breakdown + headline totals ──
  const aiRows = (aiThisMonth ?? []) as Array<{ business_id: string | null; reference_id: string | null; provider: string; amount_usd_cents: number; created_at: string; metadata: Record<string, unknown> }>
  const nonAiRows = (nonAiThisMonth ?? []) as Array<{ business_id: string | null; category: Category; provider: string; amount_usd_cents: number; created_at: string }>

  const categoryTotals: Record<Category, number> = { ai: 0, sms: 0, email: 0, payment_fee: 0, infra: 0, other: 0 }
  for (const r of aiRows) categoryTotals.ai += r.amount_usd_cents
  for (const r of nonAiRows) categoryTotals[r.category] = (categoryTotals[r.category] ?? 0) + r.amount_usd_cents

  const aiMeteredThisMonth = categoryTotals.ai
  const nonAiMeteredThisMonth = nonAiRows.reduce((s, r) => s + r.amount_usd_cents, 0)
  const thisMonthMeteredCents = aiMeteredThisMonth + nonAiMeteredThisMonth
  const thisMonthTotalCents = thisMonthMeteredCents + fixedThisMonthCents

  const aiLastMonthCents = ((aiLastMonth ?? []) as Array<{ amount_usd_cents: number }>).reduce((s, r) => s + r.amount_usd_cents, 0)
  const nonAiLastMonthCents = ((nonAiLastMonth ?? []) as Array<{ amount_usd_cents: number }>).reduce((s, r) => s + r.amount_usd_cents, 0)
  const lastMonthMeteredCents = aiLastMonthCents + nonAiLastMonthCents
  const lastMonthTotalCents = lastMonthMeteredCents + fixedThisMonthCents // fixed assumed roughly stable month to month
  const pctChange = lastMonthTotalCents > 0 ? Math.round(((thisMonthTotalCents - lastMonthTotalCents) / lastMonthTotalCents) * 100) : null

  // ── Anthropic prepaid credits remaining (reconciled against ALL-TIME metered AI spend, since a
  // top-up isn't scoped to a calendar month) ──
  const anthropicPurchasedCents = ((anthropicTopups ?? []) as Array<{ amount_usd_cents: number }>).reduce((s, r) => s + r.amount_usd_cents, 0)
  const { data: allTimeAiSpendRows } = await db.from('v_ai_costs').select('amount_usd_cents').eq('provider', 'anthropic').limit(50_000)
  const anthropicUsedCents = ((allTimeAiSpendRows ?? []) as Array<{ amount_usd_cents: number }>).reduce((s, r) => s + r.amount_usd_cents, 0)
  const anthropicRemainingCents = anthropicPurchasedCents - anthropicUsedCents

  // ── Per-business unit economics ──
  const meteredByBusiness = new Map<string, number>()
  for (const r of aiRows) { if (r.business_id) meteredByBusiness.set(r.business_id, (meteredByBusiness.get(r.business_id) ?? 0) + r.amount_usd_cents) }
  for (const r of nonAiRows) { if (r.business_id) meteredByBusiness.set(r.business_id, (meteredByBusiness.get(r.business_id) ?? 0) + r.amount_usd_cents) }

  const perBusiness = (businesses ?? []).map(b => {
    const metered = meteredByBusiness.get(b.id as string) ?? 0
    const totalCost = metered + fixedPerBusinessPerMonthCents
    const plan = planOf.get(b.id as string) ?? 'starter'
    const planPriceAud = PLAN_PRICES_AUD[plan] ?? null
    const planPriceUsdCents = planPriceAud != null ? Math.round(planPriceAud * 100 * USD_PER_AUD) : null
    const marginPct = planPriceUsdCents ? Math.round(((planPriceUsdCents - totalCost) / planPriceUsdCents) * 100) : null
    return {
      business_id: b.id, name: b.name, plan,
      plan_price_usd_cents: planPriceUsdCents,
      metered_cost_usd_cents: Math.round(metered),
      allocated_fixed_usd_cents: Math.round(fixedPerBusinessPerMonthCents),
      total_cost_usd_cents: Math.round(totalCost),
      margin_pct: marginPct,
    }
  }).sort((a, b) => b.total_cost_usd_cents - a.total_cost_usd_cents)

  // ── AI drill-down ──
  let chatCents = 0, cronCents = 0
  const providerSplit = new Map<string, number>()
  const perBusinessDaily = new Map<string, Map<string, number>>()
  for (const r of aiRows) {
    if (isCronAgentKey(r.reference_id)) cronCents += r.amount_usd_cents
    else chatCents += r.amount_usd_cents
    providerSplit.set(r.provider, (providerSplit.get(r.provider) ?? 0) + r.amount_usd_cents)
    if (r.business_id) {
      const day = r.created_at.slice(0, 10)
      const m = perBusinessDaily.get(r.business_id) ?? new Map<string, number>()
      m.set(day, (m.get(day) ?? 0) + r.amount_usd_cents)
      perBusinessDaily.set(r.business_id, m)
    }
  }
  // Batch split: batch-submitted AI agent_keys carry '_batch' in their key (hypothesis_engine_batch,
  // daily_briefing_batch — see AI-COST-2/COST-LEDGER-1's batch poll routes).
  const batchCents = aiRows.filter(r => (r.reference_id ?? '').includes('batch')).reduce((s, r) => s + r.amount_usd_cents, 0)
  const realtimeCents = aiMeteredThisMonth - batchCents

  // >2x-baseline flags: today's spend per business vs the trailing (non-today) daily average this month.
  const twoXFlags: Array<{ business_id: string; name: string; today_cents: number; daily_avg_cents: number }> = []
  for (const [bid, days] of perBusinessDaily) {
    const today = days.get(todayKey) ?? 0
    const prior = [...days.entries()].filter(([d]) => d !== todayKey).map(([, v]) => v)
    const avg = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : 0
    if (avg > 20 && today > 2 * avg) twoXFlags.push({ business_id: bid, name: nameOf.get(bid) ?? '—', today_cents: Math.round(today), daily_avg_cents: Math.round(avg) })
  }
  twoXFlags.sort((a, b) => b.today_cents - a.today_cents)

  // Budget ceiling status (AI-COST-2's businesses.ai_daily_budget_cents)
  const { data: budgetBiz } = await db.from('businesses').select('id, name, ai_daily_budget_cents').eq('is_active', true).not('ai_daily_budget_cents', 'is', null)
  const todayStart = todayKey + 'T00:00:00.000Z'
  const { data: todayAiCalls } = await db.from('v_ai_costs').select('business_id, amount_usd_cents').gte('created_at', todayStart).limit(50_000)
  const todaySpendByBiz = new Map<string, number>()
  for (const r of (todayAiCalls ?? []) as Array<{ business_id: string | null; amount_usd_cents: number }>) {
    if (r.business_id) todaySpendByBiz.set(r.business_id, (todaySpendByBiz.get(r.business_id) ?? 0) + r.amount_usd_cents)
  }
  const budgetCeilingStatus = ((budgetBiz ?? []) as Array<{ id: string; name: string; ai_daily_budget_cents: number }>).map(b => ({
    business_id: b.id, name: b.name, budget_cents: b.ai_daily_budget_cents,
    spent_today_cents: Math.round(todaySpendByBiz.get(b.id) ?? 0),
    pct: Math.round(((todaySpendByBiz.get(b.id) ?? 0) / Math.max(1, b.ai_daily_budget_cents)) * 100),
  }))

  // ── Cost-model projection widget (venues slider) — live fixed-cost allocation ──
  const venues = venuesParam ? Number(venuesParam) : activeBusinessCount
  const costModelData = loadCostModelData()
  const fixedPerBusinessPerDayUsd = (fixedThisMonthCents / activeBusinessCount / 30) / 100
  const projectionAsIs = computeFullCogsPerBusinessPerDay(costModelData, 'as_is', fixedPerBusinessPerDayUsd)
  const projectionWasteGated = computeFullCogsPerBusinessPerDay(costModelData, 'waste_gated', fixedPerBusinessPerDayUsd)

  return NextResponse.json({
    headline: {
      this_month_metered_usd_cents: Math.round(thisMonthMeteredCents),
      this_month_fixed_usd_cents: Math.round(fixedThisMonthCents),
      this_month_total_usd_cents: Math.round(thisMonthTotalCents),
      last_month_total_usd_cents: Math.round(lastMonthTotalCents),
      pct_change: pctChange,
      anthropic_credits_purchased_usd_cents: Math.round(anthropicPurchasedCents),
      anthropic_credits_used_usd_cents: Math.round(anthropicUsedCents),
      anthropic_credits_remaining_usd_cents: Math.round(anthropicRemainingCents),
    },
    category_breakdown: (Object.entries(categoryTotals) as Array<[Category, number]>).map(([category, cents]) => ({ category, usd_cents: Math.round(cents) })).sort((a, b) => b.usd_cents - a.usd_cents),
    per_business: perBusiness,
    ai_drill_down: {
      chat_usd_cents: Math.round(chatCents),
      cron_usd_cents: Math.round(cronCents),
      realtime_usd_cents: Math.round(realtimeCents),
      batch_usd_cents: Math.round(batchCents),
      provider_split: [...providerSplit.entries()].map(([provider, usd_cents]) => ({ provider, usd_cents: Math.round(usd_cents) })).sort((a, b) => b.usd_cents - a.usd_cents),
      two_x_baseline_flags: twoXFlags,
      budget_ceiling_status: budgetCeilingStatus,
      see_also: '/admin/ai-costs',
    },
    cost_model_projection: {
      venues,
      fixed_usd_per_business_per_day: fixedPerBusinessPerDayUsd,
      as_is: projectionAsIs,
      waste_gated: projectionWasteGated,
      plan_usd_per_month: costModelData.planPricingUsdPerMonth,
    },
    renewals: renewals ?? [],
    active_business_count: activeBusinessCount,
  })
}

export const GET = withErrorCapture('admin/costs', _GET)
