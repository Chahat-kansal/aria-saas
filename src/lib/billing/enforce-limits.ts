import { getEntitlement } from '@/lib/billing/entitlement'
import { resolveLimits, tierThatLifts, LIMIT_LABELS, type LimitKey } from '@/lib/billing/limits'

/**
 * MS14 PHASE 2 — ENFORCEMENT, BUILT BUT NOT ARMED.
 *
 * The check exists, is tested, and is wired into the real gates — and it is INERT. With the flag
 * off (the default, and the only state this sprint ships) every call returns `allowed: true`
 * without so much as a database read, so behaviour is byte-identical to before this file existed.
 * Two of five businesses are real; arming this is Chahat's decision, not this run's.
 *
 * ARMING IT: set ARIA_LIMITS_ENFORCE=1. Nothing else changes — no redeploy of gate logic, no
 * code edit. Turning it back off is the same switch.
 *
 * When armed, a refusal NAMES the limit, the current count, and the tier that lifts it — never a
 * generic error, never a silent failure. `tierThatLifts` skips a tier that still would not be
 * enough, so the upgrade suggested is always one that actually helps.
 */

/** The one place the arming decision is read. Default OFF — absence of the env var means off. */
export function limitsEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.ARIA_LIMITS_ENFORCE === '1'
}

export interface LimitCheck {
  allowed: boolean
  /** Owner-facing refusal. Present only when allowed === false. */
  reason?: string
  /** Populated whenever the check actually ran, for logging/telemetry — never for display. */
  detail?: { key: LimitKey; limit: number | null; current: number; plan: string; upgrade_tier: string | null }
}

const ALLOWED: LimitCheck = Object.freeze({ allowed: true })

/**
 * Would adding one more `key` exceed this business's plan?
 *
 * `current` is the caller's already-counted total (the caller owns its own COUNT query — this
 * module never guesses what "current" means for a given resource).
 */
export async function checkLimit(args: {
  businessId: string
  key: LimitKey
  current: number
}): Promise<LimitCheck> {
  // INERT PATH — returns before any I/O. This early return is what makes flag-off provably
  // free: no entitlement read, no extra latency, no behaviour change of any kind.
  if (!limitsEnforced()) return ALLOWED

  try {
    const ent = await getEntitlement(args.businessId)
    const limits = resolveLimits(ent.plan_key)
    const limit = limits?.[args.key] ?? null
    if (limit === null) return ALLOWED // unlimited on this tier

    const detail = {
      key: args.key,
      limit,
      current: args.current,
      plan: ent.plan_key,
      upgrade_tier: tierThatLifts(args.key, args.current + 1, ent.plan_key),
    }
    if (args.current < limit) return { allowed: true, detail }

    const label = LIMIT_LABELS[args.key]
    const noun = limit === 1 ? label.singular : label.plural
    const upgrade = detail.upgrade_tier
      ? ` The ${detail.upgrade_tier} plan lifts this.`
      : ' This is the highest plan — contact support if you need more.'
    return {
      allowed: false,
      reason: `Your ${ent.plan_key} plan includes ${limit} ${noun} and you already have ${args.current}.${upgrade}`,
      detail,
    }
  } catch {
    // FAIL OPEN, deliberately. An entitlement lookup that errors must never lock an owner out of
    // their own business — the failure mode of a billing check should be "the customer keeps
    // working", not "the customer is locked out by our outage". Refusals must be earned.
    return ALLOWED
  }
}
