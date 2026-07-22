import type { SupabaseClient } from '@supabase/supabase-js'
import type { LeaderboardRow } from '@/lib/community/leaderboard'
import { awardPointsViaLedger } from '@/lib/loyalty/award-ledger'

// CX-GAME-2 — weekly top-3 leaderboard reward. Fired from the daily cron only on the configured
// week-boundary day (Monday) against that run's freshly-computed 7d snapshot. Same insert-first-
// then-issue idempotency discipline as level-awards.ts: community_leaderboard_awards'
// UNIQUE(business_id, loyalty_identity_id, period_start) is the gate. Top-3 among LINKED,
// non-opted-out identities only — computeLeaderboardSnapshot already excludes opted-out members
// before ranking, so any row present here is already eligible.

export async function processLeaderboardAwards(
  supabase: SupabaseClient, businessId: string, snapshot7d: LeaderboardRow[], periodStart: string,
): Promise<{ issued: number }> {
  const { data: cfg } = await supabase.from('community_leaderboard_config')
    .select('rank1_reward_rule_id, rank2_reward_rule_id, rank3_reward_rule_id').eq('business_id', businessId).maybeSingle()
  if (!cfg) return { issued: 0 } // no config row = feature off by default

  const rankRules: Record<number, string | null> = {
    1: cfg.rank1_reward_rule_id as string | null,
    2: cfg.rank2_reward_rule_id as string | null,
    3: cfg.rank3_reward_rule_id as string | null,
  }
  if (!rankRules[1] && !rankRules[2] && !rankRules[3]) return { issued: 0 }

  const top3 = snapshot7d.filter(r => r.rank <= 3 && rankRules[r.rank]).sort((a, b) => a.rank - b.rank)
  if (!top3.length) return { issued: 0 }

  const memberIds = top3.map(r => r.member_id)
  const { data: links } = await supabase.from('community_member_loyalty_links')
    .select('member_id, loyalty_identity_id').eq('business_id', businessId).in('member_id', memberIds)
  const linkMap = new Map(((links ?? []) as Array<{ member_id: string; loyalty_identity_id: string }>).map(l => [l.member_id, l.loyalty_identity_id]))

  let issued = 0
  for (const row of top3) {
    const ruleId = rankRules[row.rank]
    const loyaltyIdentityId = linkMap.get(row.member_id)
    if (!ruleId || !loyaltyIdentityId) continue

    const { error: claimErr } = await supabase.from('community_leaderboard_awards').insert({
      business_id: businessId, loyalty_identity_id: loyaltyIdentityId, period_start: periodStart, rank: row.rank, reward_rule_id: ruleId,
    })
    if (claimErr) continue // UNIQUE conflict — already issued for this identity+week, never re-issue

    const { data: rule } = await supabase.from('loyalty_reward_rules').select('points_value').eq('id', ruleId).maybeSingle()
    const points = Math.max(0, Math.round(Number(rule?.points_value ?? 0)))
    if (points > 0) await awardPointsViaLedger(row.customer_id, businessId, points)
    issued++
  }
  return { issued }
}
