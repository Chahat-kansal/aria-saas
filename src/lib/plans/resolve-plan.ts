// SS — single source of plan truth. businesses.plan is canonical (Part 0: Option B):
// universally populated (16/16), kept in sync by the Stripe webhook mirror, and the
// target of admin plan_override. business_subscriptions enriches trial/Stripe detail.

export type Plan = 'starter' | 'growth' | 'pro'

export interface PlanInputs {
  plan?: string | null
  subscription_status?: string | null
  trial_ends_at?: string | null
  stripe_subscription_id?: string | null
  plan_override_by?: string | null
}

const VALID: Plan[] = ['starter', 'growth', 'pro']

export function normalizePlan(p: string | null | undefined): Plan {
  const v = (p ?? '').toLowerCase().trim()
  if ((VALID as string[]).includes(v)) return v as Plan
  // tolerate legacy/aliases
  if (v === 'free') return 'starter'
  if (v === 'business' || v === 'premium') return 'pro'
  return 'starter'
}

/** Handles BOTH 'trial' (column default) AND 'trialing' (live data). */
export function isTrialing(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase().trim()
  return s === 'trial' || s === 'trialing'
}

export function trialExpired(trialEndsAt: string | null | undefined): boolean {
  if (!trialEndsAt) return false // no end date → treat as not-yet-expired (open trial)
  const t = new Date(trialEndsAt).getTime()
  return Number.isFinite(t) && t < Date.now()
}

export function trialDaysRemaining(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null
  const ms = new Date(trialEndsAt).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  return Math.ceil(ms / 86_400_000)
}

/**
 * Resolve the effective plan a business is entitled to RIGHT NOW.
 * - Admin override (plan_override_by) always wins.
 * - Active trial → Pro (free trial of Pro; chosen so existing trialing businesses keep access).
 * - Paid Stripe subscription → their plan.
 * - Expired trial + no sub → starter.
 */
export function getEffectivePlan(b: PlanInputs | null | undefined): Plan {
  if (!b) return 'starter'
  if (b.plan_override_by) return normalizePlan(b.plan) // admin grant wins
  const signup = normalizePlan(b.plan)
  const trialing = isTrialing(b.subscription_status)
  if (trialing && !trialExpired(b.trial_ends_at)) return 'pro'
  if (b.stripe_subscription_id) return signup
  if (trialing && trialExpired(b.trial_ends_at)) return 'starter'
  return signup
}

/** True when an active trial is within N days of ending (default 3) — for the expiry banner. */
export function trialEndingSoon(b: PlanInputs | null | undefined, withinDays = 3): boolean {
  if (!b || !isTrialing(b.subscription_status) || trialExpired(b.trial_ends_at)) return false
  const d = trialDaysRemaining(b.trial_ends_at)
  return d !== null && d <= withinDays
}
