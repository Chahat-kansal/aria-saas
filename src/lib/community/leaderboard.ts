import type { SupabaseClient } from '@supabase/supabase-js'
import { pointsToLevel } from '@/lib/community/levels'

// CX-GAME-LEAN — leaderboard ranks community members (linked to loyalty, see loyalty-link.ts) by a
// composite of real signals only, over a rolling window. Score weights (documented, tune later):
//   visits   × 15  — a real completed sale is the strongest "this person actually shows up" signal
//   points   × 0.1 — points already scale with $ spent; a small multiplier avoids it dominating
//   challenges × 30 — a completed challenge is a deliberate, real engagement action
//   referrals × 50 — highest weight: brought in a genuinely NEW customer, not just returned themselves
// No invented deltas: rank-movement arrows are computed by the caller comparing against a PREVIOUS
// snapshot, only when one exists.

export type LeaderboardPeriod = '7d' | '30d' | 'all'

export interface LeaderboardRow {
  member_id: string
  customer_id: string
  display_name: string
  level: number
  visits: number
  points: number
  challenges: number
  referrals: number
  score: number
  rank: number
  /** Positive = moved up N spots since the last snapshot; negative = down; null = no prior snapshot
   * existed for this member (never fabricate a delta — see attachRankMovement()). Embedded into the
   * row itself at persist time because community_leaderboard_snapshots keeps latest-only (per spec) —
   * without this, movement would be unrecoverable the moment the old snapshot is overwritten. */
  rankMovement: number | null
}

/** Attach rankMovement to freshly-computed rows by comparing against the snapshot about to be
 * overwritten. Call this AFTER computeLeaderboardSnapshot and BEFORE persistLeaderboardSnapshot. */
export function attachRankMovement(rows: LeaderboardRow[], previousRows: LeaderboardRow[] | null): LeaderboardRow[] {
  const prevRankByMember = new Map((previousRows ?? []).map(r => [r.member_id, r.rank]))
  return rows.map(r => {
    const prevRank = prevRankByMember.get(r.member_id)
    return { ...r, rankMovement: prevRank == null ? null : prevRank - r.rank }
  })
}

const WINDOW_DAYS: Record<LeaderboardPeriod, number | null> = { '7d': 7, '30d': 30, all: null }

function windowStartIso(period: LeaderboardPeriod): string | null {
  const days = WINDOW_DAYS[period]
  if (days == null) return null
  return new Date(Date.now() - days * 86400000).toISOString()
}

function displayName(nickname: string | null, customerName: string | null): string {
  if (nickname && nickname.trim()) return nickname.trim()
  const parts = (customerName ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Member'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

export async function computeLeaderboardSnapshot(
  supabase: SupabaseClient, businessId: string, period: LeaderboardPeriod,
): Promise<LeaderboardRow[]> {
  const windowStart = windowStartIso(period)

  // 1. Every linked member for this business, excluding opt-outs.
  const { data: links } = await supabase
    .from('community_member_loyalty_links')
    .select('member_id, customer_id, community_members(nickname), pos_customers(name, leaderboard_opt_out)')
    .eq('business_id', businessId)
  type LinkRow = { member_id: string; customer_id: string; community_members: { nickname: string | null } | null; pos_customers: { name: string | null; leaderboard_opt_out: boolean | null } | null }
  const eligible = ((links ?? []) as unknown as LinkRow[]).filter(l => !l.pos_customers?.leaderboard_opt_out)
  if (!eligible.length) return []

  const customerIds = eligible.map(l => l.customer_id)

  // 2. Real signals, batched (no N+1 across members).
  let salesQ = supabase.from('pos_sales').select('customer_id').eq('business_id', businessId).eq('status', 'completed').in('customer_id', customerIds)
  if (windowStart) salesQ = salesQ.gte('created_at', windowStart)
  let pointsQ = supabase.from('pos_loyalty_transactions').select('customer_id, points_delta').eq('business_id', businessId).in('customer_id', customerIds).gt('points_delta', 0)
  if (windowStart) pointsQ = pointsQ.gte('created_at', windowStart)
  // "Completed" = has a completed_at timestamp — the schema's status enum isn't verified live, the
  // timestamp is ground truth regardless of what status string a given row carries.
  let challengesQ = supabase.from('loyalty_challenges').select('customer_id').eq('business_id', businessId).in('customer_id', customerIds).not('completed_at', 'is', null)
  if (windowStart) challengesQ = challengesQ.gte('completed_at', windowStart)
  let referralsQ = supabase.from('loyalty_referrals').select('referrer_customer_id').eq('business_id', businessId).eq('status', 'rewarded').in('referrer_customer_id', customerIds)
  if (windowStart) referralsQ = referralsQ.gte('rewarded_at', windowStart)

  const [{ data: sales }, { data: pts }, { data: challenges }, { data: referrals }] = await Promise.all([salesQ, pointsQ, challengesQ, referralsQ])

  const visitsMap = new Map<string, number>()
  for (const s of sales ?? []) visitsMap.set(s.customer_id as string, (visitsMap.get(s.customer_id as string) ?? 0) + 1)
  const pointsMap = new Map<string, number>()
  for (const p of pts ?? []) pointsMap.set(p.customer_id as string, (pointsMap.get(p.customer_id as string) ?? 0) + (Number(p.points_delta) || 0))
  const challengesMap = new Map<string, number>()
  for (const c of challenges ?? []) challengesMap.set(c.customer_id as string, (challengesMap.get(c.customer_id as string) ?? 0) + 1)
  const referralsMap = new Map<string, number>()
  for (const r of referrals ?? []) referralsMap.set(r.referrer_customer_id as string, (referralsMap.get(r.referrer_customer_id as string) ?? 0) + 1)

  // 3. Lifetime points (for the level shown alongside the window score — level is always lifetime, not windowed).
  const { getLifetimePointsBatch } = await import('@/lib/community/points')
  const lifetimeMap = await getLifetimePointsBatch(customerIds)

  const rows = eligible.map(l => {
    const visits = visitsMap.get(l.customer_id) ?? 0
    const points = pointsMap.get(l.customer_id) ?? 0
    const challengesCount = challengesMap.get(l.customer_id) ?? 0
    const referralsCount = referralsMap.get(l.customer_id) ?? 0
    const score = Math.round((visits * 15 + points * 0.1 + challengesCount * 30 + referralsCount * 50) * 10) / 10
    return {
      member_id: l.member_id, customer_id: l.customer_id,
      display_name: displayName(l.community_members?.nickname ?? null, l.pos_customers?.name ?? null),
      level: pointsToLevel(lifetimeMap.get(l.customer_id) ?? 0).level,
      visits, points, challenges: challengesCount, referrals: referralsCount, score, rank: 0,
      rankMovement: null as number | null,
    }
  }).sort((a, b) => b.score - a.score)

  rows.forEach((r, i) => { r.rank = i + 1 })
  return rows
}

export async function persistLeaderboardSnapshot(supabase: SupabaseClient, businessId: string, period: LeaderboardPeriod, rows: LeaderboardRow[]): Promise<void> {
  await supabase.from('community_leaderboard_snapshots').upsert({
    business_id: businessId, period, rows, computed_at: new Date().toISOString(),
  }, { onConflict: 'business_id,period' })
}
