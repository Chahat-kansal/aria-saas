import type { SupabaseClient } from '@supabase/supabase-js'

// CX-GAME-LEAN — pure level-derivation function. No DB access, no side effects.
// Level derives ONLY from real lifetime EARNED points (sum of positive pos_loyalty_transactions
// rows) — see lib/community/points.ts. A member with zero ledger rows is L1 with 0 progress; this
// function never fabricates a level from anything else.
//
// CX-GAME-2 — gained an optional per-business threshold override (community_level_config). Falls
// back to the hardcoded L1-L5 thresholds when a business has zero config rows — this is the ONLY
// fallback condition; a business with SOME rows uses exactly those (see getLevelThresholds).

export interface LevelInfo {
  level: number
  name: string
  nextAt: number | null
  progress: number
}

export interface LevelThreshold {
  level: number
  name: string
  min: number
  perkRewardRuleId: string | null
}

const HARDCODED_THRESHOLDS: LevelThreshold[] = [
  { level: 1, name: 'Regular', min: 0, perkRewardRuleId: null },
  { level: 2, name: 'Local', min: 100, perkRewardRuleId: null },
  { level: 3, name: 'Insider', min: 300, perkRewardRuleId: null },
  { level: 4, name: 'VIP', min: 750, perkRewardRuleId: null },
  { level: 5, name: 'Legend', min: 1500, perkRewardRuleId: null },
]

/** Fetch this business's level thresholds, sorted by level. Returns the hardcoded fallback (a copy —
 * callers may read but must not mutate) when the business has zero community_level_config rows. */
export async function getLevelThresholds(supabase: SupabaseClient, businessId: string): Promise<LevelThreshold[]> {
  const { data } = await supabase
    .from('community_level_config')
    .select('level, name, min_points, perk_reward_rule_id')
    .eq('business_id', businessId)
    .order('level', { ascending: true })
  if (!data?.length) return HARDCODED_THRESHOLDS
  return data.map(r => ({ level: r.level as number, name: r.name as string, min: r.min_points as number, perkRewardRuleId: (r.perk_reward_rule_id as string | null) ?? null }))
}

/** Strictly-increasing min_points per level (by level order), else a config is nonsensical — a
 * member could level DOWN as they earn more, or two levels could tie. Called before every write. */
export function validateLevelThresholds(rows: Array<{ level: number; min_points: number }>): { valid: boolean; error?: string } {
  const sorted = [...rows].sort((a, b) => a.level - b.level)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min_points <= sorted[i - 1].min_points) {
      return { valid: false, error: `Level ${sorted[i].level}'s threshold (${sorted[i].min_points}) must be greater than level ${sorted[i - 1].level}'s (${sorted[i - 1].min_points}).` }
    }
  }
  return { valid: true }
}

export function pointsToLevel(lifetimePoints: number, thresholds: LevelThreshold[] = HARDCODED_THRESHOLDS): LevelInfo {
  // Defensive floor at 0 — getLifetimePoints() only ever sums positive ledger entries so a negative
  // input shouldn't reach here in practice, but a bare `points >= min` loop below would otherwise
  // leave `next` at its initial value (never entering the loop body for any negative input) and
  // incorrectly report "max level reached" instead of L1. Clamping here means that can't happen.
  const points = Math.max(0, Number(lifetimePoints) || 0)
  const sorted = thresholds.length ? thresholds : HARDCODED_THRESHOLDS
  let current = sorted[0]
  let next: LevelThreshold | null = sorted[1] ?? null
  for (let i = 0; i < sorted.length; i++) {
    if (points >= sorted[i].min) {
      current = sorted[i]
      next = sorted[i + 1] ?? null
    }
  }
  const progress = next ? Math.max(0, Math.min(1, (points - current.min) / (next.min - current.min))) : 1
  return {
    level: current.level,
    name: current.name,
    nextAt: next ? next.min : null,
    progress,
  }
}
