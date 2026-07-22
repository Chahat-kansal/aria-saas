export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { getLevelThresholds, validateLevelThresholds, pointsToLevel } from '@/lib/community/levels'
import { getLifetimePointsBatch } from '@/lib/community/points'

async function _GET(_req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  const [thresholds, { data: rules }, { data: rows }] = await Promise.all([
    getLevelThresholds(supabase, businessId),
    supabase.from('loyalty_reward_rules').select('id, rule_type, points_value, threshold_value, config').eq('business_id', businessId).eq('is_active', true),
    supabase.from('community_level_config').select('id').eq('business_id', businessId).limit(1),
  ])

  return NextResponse.json({
    thresholds,
    is_default: !(rows?.length),
    reward_rules: rules ?? [],
  })
}

// PUT — replace the full threshold set. Validates strictly-increasing min_points BEFORE writing
// anything (all-or-nothing). Returns a non-blocking `warning` if lowering a threshold would
// instantly level up more than 5 currently-linked members (still saves — informational only).
async function _PUT(req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { thresholds?: Array<{ level: number; min_points: number; name: string; perk_reward_rule_id: string | null }> }
  const thresholds = body.thresholds ?? []
  if (!thresholds.length) return NextResponse.json({ error: 'thresholds required' }, { status: 400 })

  const check = validateLevelThresholds(thresholds.map(t => ({ level: t.level, min_points: t.min_points })))
  if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 })

  // Compute the "many members would instantly level up" warning against the OLD config, before writing.
  let warning: string | null = null
  try {
    const oldThresholds = await getLevelThresholds(supabase, businessId)
    const { data: links } = await supabase.from('community_member_loyalty_links').select('customer_id').eq('business_id', businessId)
    const customerIds = [...new Set((links ?? []).map(l => l.customer_id as string))]
    if (customerIds.length) {
      const pointsMap = await getLifetimePointsBatch(customerIds)
      const newThresholds = thresholds.map(t => ({ level: t.level, name: t.name, min: t.min_points, perkRewardRuleId: t.perk_reward_rule_id }))
      let jumped = 0
      for (const cid of customerIds) {
        const pts = pointsMap.get(cid) ?? 0
        const oldLevel = pointsToLevel(pts, oldThresholds).level
        const newLevel = pointsToLevel(pts, newThresholds).level
        if (newLevel > oldLevel) jumped++
      }
      if (jumped > 5) warning = `This change would instantly level up ${jumped} currently-linked members on the next cron run (their perks, if any, will be issued as usual — not skipped).`
    }
  } catch { /* non-blocking — warning is informational only */ }

  await supabase.from('community_level_config').delete().eq('business_id', businessId)
  const { error } = await supabase.from('community_level_config').insert(
    thresholds.map(t => ({ business_id: businessId, level: t.level, min_points: t.min_points, name: t.name, perk_reward_rule_id: t.perk_reward_rule_id || null })),
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, warning })
}

export const GET = withBusinessContext('dashboard/community/level-config', _GET)
export const PUT = withBusinessContext('dashboard/community/level-config', _PUT)
