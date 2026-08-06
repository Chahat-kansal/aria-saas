export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getAdminClient, isAdminEmail, logAdminAction } from '@/lib/admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const PLAN_DEFAULTS: Record<string, number> = { starter: 1000, growth: 3000, pro: 8000 }
const budgetFor = (tier: string | null | undefined, col: number | null | undefined) =>
  col ?? PLAN_DEFAULTS[tier ?? ''] ?? 3000

function ymOf(d: Date) { return d.toISOString().slice(0, 7) }
function modelFamily(id: string): string {
  if (/sonnet/i.test(id)) return 'sonnet'
  if (/haiku/i.test(id)) return 'haiku'
  if (/opus/i.test(id)) return 'opus'
  return 'other'
}

interface Call { business_id: string | null; agent_key: string | null; model_id: string | null; cost_usd_cents: number | null; created_at: string }

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getAdminClient()
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('business_id')

  const now = new Date()
  const ym = ymOf(now)
  const lastYm = ymOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const todayKey = now.toISOString().slice(0, 10)

  const [{ data: thisSpend }, { data: lastSpend }, { data: businesses }, { data: subs }, { data: calls }, { data: healthRows }] = await Promise.all([
    db.from('aria_monthly_spend').select('business_id, sonnet_cents, total_cents').eq('year_month', ym),
    db.from('aria_monthly_spend').select('total_cents').eq('year_month', lastYm),
    db.from('businesses').select('id, name'),
    db.from('business_subscriptions').select('business_id, tier, sonnet_monthly_budget_cents').eq('status', 'active'),
    db.from('aria_ai_calls').select('business_id, agent_key, model_id, cost_usd_cents, created_at').gte('created_at', thirtyDaysAgo.toISOString()).gt('cost_usd_cents', 0).limit(10000),
    // AI-HEALTH-1 — a SECOND query, deliberately alongside the spend one rather than replacing it.
    // The spend query's .gt('cost_usd_cents', 0) is CORRECT for cost totals and must not move the
    // numbers this page already reports. But a failed call costs $0, so that same filter made every
    // failure invisible on the only surface that reads this table — which is how a 48% Anthropic
    // failure rate ran for weeks unnoticed. No cost filter here, and success is selected.
    db.from('aria_ai_calls').select('provider, agent_key, success, error_message').gte('created_at', thirtyDaysAgo.toISOString()).limit(20000),
  ])

  const nameOf = new Map((businesses ?? []).map(b => [b.id as string, b.name as string]))
  const subOf = new Map((subs ?? []).map(s => [s.business_id as string, s]))
  const allCalls = (calls ?? []) as Call[]
  const monthCalls = allCalls.filter(c => new Date(c.created_at) >= monthStart)

  // ── Overview ──
  const thisMonthTotal = (thisSpend ?? []).reduce((n, r) => n + (r.total_cents ?? 0), 0)
  const lastMonthTotal = (lastSpend ?? []).reduce((n, r) => n + (r.total_cents ?? 0), 0)
  const pctChange = lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : null

  const top10 = [...(thisSpend ?? [])]
    .sort((a, b) => (b.total_cents ?? 0) - (a.total_cents ?? 0))
    .slice(0, 10)
    .map(r => {
      const sub = subOf.get(r.business_id as string)
      const budget = budgetFor(sub?.tier as string, sub?.sonnet_monthly_budget_cents as number)
      return { business_id: r.business_id, name: nameOf.get(r.business_id as string) ?? '—', tier: (sub?.tier as string) ?? 'none', budget, spent: r.total_cents ?? 0, sonnet: r.sonnet_cents ?? 0, pct: Math.round(((r.sonnet_cents ?? 0) / Math.max(1, budget)) * 100) }
    })

  const byAgentMap = new Map<string, { cents: number; calls: number }>()
  const byModelMap = new Map<string, number>()
  for (const c of monthCalls) {
    const ak = c.agent_key ?? 'unknown'
    const a = byAgentMap.get(ak) ?? { cents: 0, calls: 0 }
    a.cents += c.cost_usd_cents ?? 0; a.calls += 1; byAgentMap.set(ak, a)
    const fam = modelFamily(c.model_id ?? '')
    byModelMap.set(fam, (byModelMap.get(fam) ?? 0) + (c.cost_usd_cents ?? 0))
  }
  const byAgent = [...byAgentMap.entries()].map(([agent_key, v]) => ({ agent_key, ...v })).sort((a, b) => b.cents - a.cents)
  const byModel = [...byModelMap.entries()].map(([model, cents]) => ({ model, cents })).sort((a, b) => b.cents - a.cents)

  // ── Alerts ──
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  const monthRemainingFrac = (daysInMonth - now.getUTCDate()) / daysInMonth
  const overBudget: typeof top10 = []
  const trackingToExceed: typeof top10 = []
  for (const r of thisSpend ?? []) {
    const sub = subOf.get(r.business_id as string)
    const budget = budgetFor(sub?.tier as string, sub?.sonnet_monthly_budget_cents as number)
    const pct = Math.round(((r.sonnet_cents ?? 0) / Math.max(1, budget)) * 100)
    const row = { business_id: r.business_id, name: nameOf.get(r.business_id as string) ?? '—', tier: (sub?.tier as string) ?? 'none', budget, spent: r.total_cents ?? 0, sonnet: r.sonnet_cents ?? 0, pct }
    if (pct >= 100) overBudget.push(row)
    else if (pct >= 80 && monthRemainingFrac > 0.25) trackingToExceed.push(row)
  }

  // Anomalous spike: today's spend > 3× the 30-day daily average (avg > 50c).
  const perBizDaily = new Map<string, Map<string, number>>()
  for (const c of allCalls) {
    if (!c.business_id) continue
    const day = c.created_at.slice(0, 10)
    const m = perBizDaily.get(c.business_id) ?? new Map<string, number>()
    m.set(day, (m.get(day) ?? 0) + (c.cost_usd_cents ?? 0))
    perBizDaily.set(c.business_id, m)
  }
  const spikes: Array<{ business_id: string; name: string; today: number; dailyAvg: number }> = []
  for (const [bid, days] of perBizDaily) {
    const today = days.get(todayKey) ?? 0
    const prior = [...days.entries()].filter(([d]) => d !== todayKey).map(([, v]) => v)
    const avg = prior.length ? prior.reduce((n, v) => n + v, 0) / prior.length : 0
    if (avg > 50 && today > 3 * avg) spikes.push({ business_id: bid, name: nameOf.get(bid) ?? '—', today, dailyAvg: Math.round(avg) })
  }
  spikes.sort((a, b) => b.today - a.today)

  // ── Per business detail ──
  let perBusiness = null as null | Record<string, unknown>
  if (businessId) {
    const sub = subOf.get(businessId)
    const budget = budgetFor(sub?.tier as string, sub?.sonnet_monthly_budget_cents as number)
    const spendRow = (thisSpend ?? []).find(r => r.business_id === businessId)
    const bizCalls = allCalls.filter(c => c.business_id === businessId)
    const dailyMap = new Map<string, number>()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      dailyMap.set(d, 0)
    }
    for (const c of bizCalls) {
      const day = c.created_at.slice(0, 10)
      if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + (c.cost_usd_cents ?? 0))
    }
    const agentMap = new Map<string, number>()
    for (const c of bizCalls.filter(c => new Date(c.created_at) >= monthStart)) {
      const ak = c.agent_key ?? 'unknown'
      agentMap.set(ak, (agentMap.get(ak) ?? 0) + (c.cost_usd_cents ?? 0))
    }
    perBusiness = {
      business_id: businessId,
      name: nameOf.get(businessId) ?? '—',
      tier: (sub?.tier as string) ?? 'none',
      budget,
      sonnet: spendRow?.sonnet_cents ?? 0,
      spent: spendRow?.total_cents ?? 0,
      pct: Math.round(((spendRow?.sonnet_cents ?? 0) / Math.max(1, budget)) * 100),
      daily: [...dailyMap.entries()].map(([date, cents]) => ({ date: date.slice(5), cents })),
      byAgent: [...agentMap.entries()].map(([agent_key, cents]) => ({ agent_key, cents })).sort((a, b) => b.cents - a.cents),
    }
  }

  // AI-HEALTH-1 — grouped in code from the unfiltered query above. Failure rate is computed over
  // ALL calls (a failed call costs $0, so any cost filter zeroes this out by construction).
  type HealthRow = { provider: string | null; agent_key: string | null; success: boolean | null; error_message: string | null }
  const healthBuckets = new Map<string, { total: number; failures: number; agents: Set<string>; errors: Map<string, number> }>()
  for (const r of (healthRows ?? []) as HealthRow[]) {
    const p = r.provider ?? 'unknown'
    let b = healthBuckets.get(p)
    if (!b) { b = { total: 0, failures: 0, agents: new Set(), errors: new Map() }; healthBuckets.set(p, b) }
    b.total++
    if (r.success === false) {
      b.failures++
      if (r.agent_key) b.agents.add(r.agent_key)
      // Verbatim, truncated — a generic "provider error" label would have hidden
      // "Your credit balance is too low" just as effectively as the cost filter did.
      const key = (r.error_message ?? 'unknown error').slice(0, 160)
      b.errors.set(key, (b.errors.get(key) ?? 0) + 1)
    }
  }
  const health = [...healthBuckets.entries()]
    .map(([provider, b]) => ({
      provider,
      total_calls: b.total,
      failures: b.failures,
      failure_rate: b.total > 0 ? b.failures / b.total : 0,
      agents_affected: b.agents.size,
      top_errors: [...b.errors.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5)
        .map(([message, count]) => ({ message, count })),
    }))
    .sort((a, b) => b.failure_rate - a.failure_rate)

  return NextResponse.json({
    // Failure rate FIRST, cost second — a dashboard that leads with cost is what produced this
    // blind spot in the first place.
    health,
    overview: { thisMonthTotal, lastMonthTotal, pctChange, top10, byAgent, byModel },
    alerts: { overBudget, trackingToExceed, spikes },
    businesses: (businesses ?? []).map(b => ({ id: b.id, name: b.name })),
    perBusiness,
  })
}

// Adjust a business's monthly Sonnet budget.
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { business_id?: string; budget_cents?: number }
  if (!body.business_id || typeof body.budget_cents !== 'number' || body.budget_cents < 0) {
    return NextResponse.json({ error: 'business_id and budget_cents required' }, { status: 400 })
  }
  const db = getAdminClient()
  const { error } = await db.from('business_subscriptions')
    .update({ sonnet_monthly_budget_cents: Math.round(body.budget_cents) })
    .eq('business_id', body.business_id).eq('status', 'active')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({ admin_email: user.email!, action: 'adjust_ai_budget', target_type: 'business', target_id: body.business_id, details: { budget_cents: body.budget_cents } })
  return NextResponse.json({ ok: true, budget_cents: Math.round(body.budget_cents) })
}

export const GET = withErrorCapture('admin/ai-costs', _GET)
export const PATCH = withErrorCapture('admin/ai-costs', _PATCH)
