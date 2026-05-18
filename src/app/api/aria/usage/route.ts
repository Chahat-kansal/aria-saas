export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ total_cents: 0, by_provider: {}, by_agent: {}, last_7d: [], call_count: 0, success_rate: 100 })

  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString()
  const { data: calls, error } = await supabase.from('aria_ai_calls')
    .select('agent_key, provider, cost_usd_cents, success, created_at')
    .eq('business_id', bid).gte('created_at', cutoff)

  if (error?.code === '42P01') {
    return NextResponse.json({ total_cents: 0, by_provider: {}, by_agent: {}, last_7d: [], call_count: 0, success_rate: 100, note: 'aria_ai_calls table not yet created' })
  }

  const totalCents = (calls ?? []).reduce((s, c) => s + (Number(c.cost_usd_cents) || 0), 0)
  const byProvider: Record<string, number> = {}
  const byAgent: Record<string, number> = {}
  for (const c of calls ?? []) {
    byProvider[c.provider] = (byProvider[c.provider] || 0) + (Number(c.cost_usd_cents) || 0)
    byAgent[c.agent_key] = (byAgent[c.agent_key] || 0) + (Number(c.cost_usd_cents) || 0)
  }

  const last7: Record<string, number> = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)
    last7[d] = 0
  }
  for (const c of calls ?? []) {
    const day = String(c.created_at).slice(0, 10)
    if (day in last7) last7[day] += (Number(c.cost_usd_cents) || 0)
  }

  return NextResponse.json({
    total_cents: totalCents,
    total_aud: +(totalCents / 100 * 1.55).toFixed(2),
    by_provider: byProvider,
    by_agent: byAgent,
    last_7d: Object.entries(last7).sort().map(([date, cents]) => ({ date, cents })),
    call_count: (calls ?? []).length,
    success_rate: calls && calls.length > 0
      ? +((calls.filter(c => c.success).length / calls.length) * 100).toFixed(1)
      : 100,
  })
}

export const GET = withErrorCapture('aria/usage', _GET)
