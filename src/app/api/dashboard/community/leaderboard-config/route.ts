export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  const [{ data: config }, { data: rules }] = await Promise.all([
    supabase.from('community_leaderboard_config').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('loyalty_reward_rules').select('id, rule_type, points_value, threshold_value, config').eq('business_id', businessId).eq('is_active', true),
  ])
  return NextResponse.json({ config: config ?? null, reward_rules: rules ?? [] })
}

// PUT — set (or clear) which reward rule fires for each of the weekly top-3 ranks. No row / all-null
// = feature off by default; owner explicitly opts in per rank.
async function _PUT(req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { rank1_reward_rule_id?: string | null; rank2_reward_rule_id?: string | null; rank3_reward_rule_id?: string | null }
  const { error } = await supabase.from('community_leaderboard_config').upsert({
    business_id: businessId,
    rank1_reward_rule_id: body.rank1_reward_rule_id || null,
    rank2_reward_rule_id: body.rank2_reward_rule_id || null,
    rank3_reward_rule_id: body.rank3_reward_rule_id || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withBusinessContext('dashboard/community/leaderboard-config', _GET)
export const PUT = withBusinessContext('dashboard/community/leaderboard-config', _PUT)
