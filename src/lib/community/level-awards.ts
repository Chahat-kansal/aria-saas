import type { SupabaseClient } from '@supabase/supabase-js'
import { getLevelThresholds, pointsToLevel } from '@/lib/community/levels'
import { getLifetimePointsBatch } from '@/lib/community/points'
import { awardPointsViaLedger } from '@/lib/loyalty/award-ledger'

// CX-GAME-2 — level-up award issuance. Money-adjacent: PRELOAD-grade care.
// Idempotency: community_level_awards' UNIQUE(business_id, loyalty_identity_id, level) IS the gate.
// Insert-first-then-issue — if the insert conflicts, we never even attempt the ledger call, so a
// crash-and-retry (or the cron simply running twice) can never double-issue. Keyed on
// loyalty_identity_id, never member_id, so a community_member_loyalty_links re-link (different
// device, different member row, same real person) can never trigger a second issuance either.

const BACKFILL_THRESHOLD = 50

export interface LevelAwardResult {
  issued: number
  queued: boolean
  errors: number
}

export async function processLevelAwards(supabase: SupabaseClient, businessId: string): Promise<LevelAwardResult> {
  const { data: links } = await supabase.from('community_member_loyalty_links')
    .select('loyalty_identity_id, customer_id').eq('business_id', businessId)
  // Distinct by loyalty_identity_id — the real-world identity, not the community_members row.
  const identities = [...new Map(((links ?? []) as Array<{ loyalty_identity_id: string; customer_id: string }>)
    .map(l => [l.loyalty_identity_id, l.customer_id])).entries()]
    .map(([loyaltyIdentityId, customerId]) => ({ loyaltyIdentityId, customerId }))
  if (!identities.length) return { issued: 0, queued: false, errors: 0 }

  const thresholds = await getLevelThresholds(supabase, businessId)
  const pointsMap = await getLifetimePointsBatch(identities.map(i => i.customerId))

  const { data: existingAwards } = await supabase.from('community_level_awards')
    .select('loyalty_identity_id, level').eq('business_id', businessId)
  const maxAwardedMap = new Map<string, number>()
  for (const a of (existingAwards ?? []) as Array<{ loyalty_identity_id: string; level: number }>) {
    maxAwardedMap.set(a.loyalty_identity_id, Math.max(maxAwardedMap.get(a.loyalty_identity_id) ?? 0, a.level))
  }
  const isFirstEverRun = (existingAwards ?? []).length === 0

  interface Pending { loyaltyIdentityId: string; customerId: string; level: number; points: number; perkRewardRuleId: string | null }
  const pending: Pending[] = []
  for (const { loyaltyIdentityId, customerId } of identities) {
    const points = pointsMap.get(customerId) ?? 0
    const currentLevel = pointsToLevel(points, thresholds).level
    const maxAwarded = maxAwardedMap.get(loyaltyIdentityId) ?? 0
    for (const t of thresholds) {
      if (t.level > maxAwarded && t.level <= currentLevel) {
        pending.push({ loyaltyIdentityId, customerId, level: t.level, points, perkRewardRuleId: t.perkRewardRuleId })
      }
    }
  }
  if (!pending.length) return { issued: 0, queued: false, errors: 0 }

  // Human gate for a bulk first-run backfill (agents-propose-owner-approves) — a business that has
  // been tracking loyalty for a while but is only now linking community members could otherwise
  // silently mass-issue on day one.
  if (isFirstEverRun && pending.length > BACKFILL_THRESHOLD) {
    const { data: existingQueue } = await supabase.from('community_backfill_review_queue')
      .select('id').eq('business_id', businessId).eq('status', 'pending').maybeSingle()
    if (!existingQueue) {
      await supabase.from('community_backfill_review_queue').insert({
        business_id: businessId,
        proposal: pending.map(p => ({ loyalty_identity_id: p.loyaltyIdentityId, customer_id: p.customerId, level: p.level, snapshot_points: p.points, perk_reward_rule_id: p.perkRewardRuleId })),
        awards_pending: pending.length,
        identity_count: new Set(pending.map(p => p.loyaltyIdentityId)).size,
      })
    }
    return { issued: 0, queued: true, errors: 0 }
  }

  let issued = 0, errors = 0
  for (const p of pending.sort((a, b) => a.level - b.level)) {
    const { error: claimErr } = await supabase.from('community_level_awards').insert({
      business_id: businessId, loyalty_identity_id: p.loyaltyIdentityId, level: p.level,
      snapshot_points: p.points, reward_rule_id: p.perkRewardRuleId,
    })
    if (claimErr) continue // UNIQUE conflict — already issued for this identity+level, never re-issue

    if (p.perkRewardRuleId) {
      try {
        const { data: rule } = await supabase.from('loyalty_reward_rules').select('points_value').eq('id', p.perkRewardRuleId).maybeSingle()
        const perkPoints = Math.max(0, Math.round(Number(rule?.points_value ?? 0)))
        if (perkPoints > 0) await awardPointsViaLedger(p.customerId, businessId, perkPoints)
        issued++
      } catch (e) {
        // Award row already claimed (the level-up itself is real and recorded) — the LEDGER step
        // failed. Never delete/retry blindly; surface for review instead.
        errors++
        await supabase.from('community_level_awards').update({ issue_error: String(e) })
          .eq('business_id', businessId).eq('loyalty_identity_id', p.loyaltyIdentityId).eq('level', p.level)
      }
    } else {
      issued++ // no perk attached to this level — the level-up itself is still recorded
    }
  }
  return { issued, queued: false, errors }
}
