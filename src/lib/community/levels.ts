// CX-GAME-LEAN — pure level-derivation function. No DB access, no side effects.
// Level derives ONLY from real lifetime EARNED points (sum of positive pos_loyalty_transactions
// rows) — see lib/community/points.ts. A member with zero ledger rows is L1 with 0 progress; this
// function never fabricates a level from anything else.

export interface LevelInfo {
  level: number
  name: string
  nextAt: number | null
  progress: number
}

const THRESHOLDS: Array<{ level: number; name: string; min: number }> = [
  { level: 1, name: 'Regular', min: 0 },
  { level: 2, name: 'Local', min: 100 },
  { level: 3, name: 'Insider', min: 300 },
  { level: 4, name: 'VIP', min: 750 },
  { level: 5, name: 'Legend', min: 1500 },
]

export function pointsToLevel(lifetimePoints: number): LevelInfo {
  // Defensive floor at 0 — getLifetimePoints() only ever sums positive ledger entries so a negative
  // input shouldn't reach here in practice, but a bare `points >= min` loop below would otherwise
  // leave `next` at its initial value (never entering the loop body for any negative input) and
  // incorrectly report "max level reached" instead of L1. Clamping here means that can't happen.
  const points = Math.max(0, Number(lifetimePoints) || 0)
  let current = THRESHOLDS[0]
  let next: typeof THRESHOLDS[number] | null = THRESHOLDS[1] ?? null
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (points >= THRESHOLDS[i].min) {
      current = THRESHOLDS[i]
      next = THRESHOLDS[i + 1] ?? null
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
