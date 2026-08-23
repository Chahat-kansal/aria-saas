import { PLANS } from '@/lib/billing/plans'
import { normalizePlan, type Plan } from '@/lib/plans/resolve-plan'

/**
 * MS14 PHASE 1 — WHAT EACH PLAN ACTUALLY ALLOWS.
 *
 * ONE place that answers "what is this business allowed to have?", DERIVED from billing/plans.ts
 * rather than restating it. Not one number is defined here: every value is read from PLANS, so a
 * pricing change stays a single edit in that file and this module cannot drift from it. (MS12's
 * lesson: the moment a limit has two sources, they disagree and enforcement locks someone out.)
 *
 * Tier resolution goes through normalizePlan, which is why the live `autonomous` tier — a real
 * row in business_subscriptions that appears in no plan file — resolves to a COMPLETE limit set
 * (aliased to pro) instead of an undefined one. A tier that exists in data but not in code is an
 * enforcement lockout waiting to happen; this module is where that would bite first.
 */

export type LimitKey = 'outlets' | 'staff' | 'agents' | 'routines' | 'ai_spend_usd'

/** Every limit this codebase can actually enforce. Order is display order. */
export const LIMIT_KEYS: readonly LimitKey[] = ['outlets', 'staff', 'agents', 'routines', 'ai_spend_usd']

/** A value of `null` means UNLIMITED — the convention plans.ts already uses. */
export type LimitSet = Record<LimitKey, number | null>

/** Human labels for refusal messages — the owner reads these, not the keys. */
export const LIMIT_LABELS: Record<LimitKey, { singular: string; plural: string }> = {
  outlets: { singular: 'outlet', plural: 'outlets' },
  staff: { singular: 'staff member', plural: 'staff members' },
  agents: { singular: 'agent', plural: 'agents' },
  routines: { singular: 'scheduled routine', plural: 'scheduled routines' },
  ai_spend_usd: { singular: 'monthly AI budget (USD)', plural: 'monthly AI budget (USD)' },
}

/**
 * PARKED — limits the sprint named but plans.ts does NOT define, so no number was invented
 * (decision table: "If a limit isn't defined there, PARK it rather than inventing a number").
 * Each needs a founder decision on the per-tier value before it can be enforced or metered as a
 * cap. Verified 2026-08: no reels cap exists anywhere in src/ — not in plans.ts, not in
 * features.ts, not as a constant.
 */
export const PARKED_LIMITS: readonly { key: string; reason: string }[] = [
  { key: 'reels', reason: 'No per-tier reel allowance exists in plans.ts or anywhere in src/. reel_monthly_invoices bills usage after the fact; that is metering, not a cap.' },
]

/** The tiers a limit set is built for. Ordered cheapest → most permissive (upgrade order). */
const TIERS: readonly Plan[] = ['starter', 'growth', 'pro']

/**
 * Built ONCE at module load from PLANS. Frozen so a caller cannot mutate a limit at runtime and
 * quietly change what another caller enforces.
 */
const LIMITS_BY_TIER: Record<string, LimitSet> = Object.freeze(
  Object.fromEntries(
    TIERS.map(tier => [tier, Object.freeze({
      outlets: PLANS[tier].max_outlets,
      staff: PLANS[tier].max_staff,
      agents: PLANS[tier].max_agents,
      routines: PLANS[tier].max_routines,
      ai_spend_usd: PLANS[tier].ai_budget_usd,
    })]),
  ),
)

/**
 * The limit set for any tier string that can appear in live data — including `autonomous`, an
 * empty string, or null. Returns null ONLY if the resolved tier has no limit set at all, which
 * is the failure this module's test exists to catch.
 */
export function resolveLimits(planLike: string | null | undefined): LimitSet | null {
  const plan = normalizePlan(planLike)
  return LIMITS_BY_TIER[plan] ?? null
}

/** True when every enforceable limit has a value (a number or an explicit unlimited). */
export function isCompleteLimitSet(set: LimitSet | null): boolean {
  if (!set) return false
  return LIMIT_KEYS.every(k => k in set && (set[k] === null || typeof set[k] === 'number'))
}

/**
 * The cheapest tier that would allow `needed` of `key` — i.e. the upgrade to name in a refusal.
 * Returns null when no tier lifts it (already on the most permissive tier), so a caller can say
 * so plainly rather than advertising an upgrade that does not exist.
 */
export function tierThatLifts(key: LimitKey, needed: number, currentPlan: Plan): Plan | null {
  const currentIdx = TIERS.indexOf(currentPlan)
  for (let i = currentIdx + 1; i < TIERS.length; i++) {
    const limit = LIMITS_BY_TIER[TIERS[i]]?.[key]
    if (limit === null || (typeof limit === 'number' && limit >= needed)) return TIERS[i]
  }
  return null
}

/** The whole table, for reporting and for the run log. Never mutated — a copy per call. */
export function limitsTable(): Array<{ tier: Plan } & LimitSet> {
  return TIERS.map(tier => ({ tier, ...LIMITS_BY_TIER[tier] }))
}
