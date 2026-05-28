export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const PLAN_DEFAULTS: Record<string, number> = { starter: 1000, growth: 3000, pro: 8000 }

// Friendly feature labels for the agent_key breakdown.
const FEATURE_LABELS: Record<string, string> = {
  ask_aria: 'Ask Aria', daily_briefing: 'Daily briefings', briefing: 'Daily briefings',
  seo_fix: 'SEO fixes', council: 'Aria council', autopilot: 'Autopilot',
  competitor_intel: 'Competitor intel', bundle_builder: 'Bundle builder',
}
const labelFor = (k: string | null) => FEATURE_LABELS[k ?? ''] ?? (k ?? 'other').replace(/_/g, ' ')

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const now = new Date()
  const ym = now.toISOString().slice(0, 7)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [{ data: spend }, { data: sub }, { data: calls }] = await Promise.all([
    supabaseAdmin.from('aria_monthly_spend').select('sonnet_cents, total_cents').eq('business_id', bid).eq('year_month', ym).maybeSingle(),
    supabaseAdmin.from('business_subscriptions').select('tier, sonnet_monthly_budget_cents').eq('business_id', bid).eq('status', 'active').maybeSingle(),
    supabaseAdmin.from('aria_ai_calls').select('agent_key, cost_usd_cents, created_at').eq('business_id', bid).gte('created_at', thirtyDaysAgo.toISOString()).gt('cost_usd_cents', 0),
  ])

  const budget = (sub?.sonnet_monthly_budget_cents as number) ?? PLAN_DEFAULTS[(sub?.tier as string) ?? ''] ?? 3000
  const sonnetUsed = spend?.sonnet_cents ?? 0
  const totalThisMonth = spend?.total_cents ?? 0

  const dailyMap = new Map<string, number>()
  for (let i = 29; i >= 0; i--) dailyMap.set(new Date(now.getTime() - i * 864e5).toISOString().slice(0, 10), 0)
  const featureMap = new Map<string, number>()
  for (const c of (calls ?? [])) {
    const day = c.created_at.slice(0, 10)
    if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + (c.cost_usd_cents ?? 0))
    if (new Date(c.created_at) >= monthStart) {
      const k = labelFor(c.agent_key)
      featureMap.set(k, (featureMap.get(k) ?? 0) + (c.cost_usd_cents ?? 0))
    }
  }

  return NextResponse.json({
    tier: (sub?.tier as string) ?? 'starter',
    budget_cents: budget,
    sonnet_used_cents: sonnetUsed,
    total_this_month_cents: totalThisMonth,
    percent_used: Math.min(100, Math.round((sonnetUsed / Math.max(1, budget)) * 100)),
    daily: [...dailyMap.entries()].map(([date, cents]) => ({ date: date.slice(5), cents })),
    by_feature: [...featureMap.entries()].map(([feature, cents]) => ({ feature, cents })).sort((a, b) => b.cents - a.cents),
  })
}

export const GET = withErrorCapture('dashboard/ai-usage', _GET)
