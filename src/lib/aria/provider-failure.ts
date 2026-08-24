/**
 * MS15 PHASE 1 — WHY the provider failed, not just that it did.
 *
 * The admin AI-health block already showed a 60% Anthropic failure rate and the verbatim error
 * strings (AI-HEALTH-1 — it existed, and it worked). What it could not say is the one thing that
 * decides what anybody should DO about it: whether this is a bill to pay, a key to rotate, a
 * limit to back off from, or a blip to ignore. Measured on the live ledger, 2,401 of 2,533
 * Anthropic failures in 30 days are a single cause — "Your credit balance is too low" — running
 * continuously since 2026-07-27 and still failing today.
 *
 * A failure class that needs a HUMAN is not the same as one the system will ride out, and only
 * the first should ever interrupt anyone. This module draws that line, purely and testably.
 */

export type FailureClass =
  | 'billing_credit'   // the account is out of money — nothing in code can fix it
  | 'auth'             // key missing/invalid/revoked
  | 'rate_limit'       // too many requests — backoff handles it
  | 'overloaded'       // provider-side capacity — backoff handles it
  | 'timeout'          // our own deadline fired
  | 'bad_request'      // our payload was wrong — a code bug
  | 'unknown'

export interface FailureClassification {
  klass: FailureClass
  /** True when no amount of retrying, failover or patience fixes this — a person must act. */
  action_required: boolean
  /** What that person should actually do. Plain, specific, no jargon. */
  action: string | null
}

const NEEDS_A_HUMAN: Record<string, { action: string }> = {
  billing_credit: { action: 'Top up the Anthropic account (Plans & Billing). Every call is being rejected before it runs; Aria is answering from a fallback provider with no live data tools.' },
  auth: { action: 'Rotate or set the provider API key in the deployment environment.' },
  bad_request: { action: 'A request shape is wrong — this is a code bug, not an account problem. Check the most recent change to the failing agent.' },
}

export function classifyProviderFailure(errorMessage: string | null | undefined): FailureClassification {
  const msg = String(errorMessage ?? '')
  const lower = msg.toLowerCase()

  let klass: FailureClass = 'unknown'
  if (/credit balance is too low|insufficient (?:funds|credit|quota)|billing|payment required|402/.test(lower)) klass = 'billing_credit'
  else if (/\b401\b|unauthorized|invalid api key|authentication|permission denied|api key not/.test(lower)) klass = 'auth'
  else if (/\b429\b|rate.?limit|too many requests|quota exceeded/.test(lower)) klass = 'rate_limit'
  else if (/\b529\b|\b503\b|overload|capacity|unavailable/.test(lower)) klass = 'overloaded'
  else if (/timed out|timeout|etimedout|aborted/.test(lower)) klass = 'timeout'
  else if (/\b400\b|invalid_request|invalid request|bad request/.test(lower)) klass = 'bad_request'

  const human = NEEDS_A_HUMAN[klass]
  return { klass, action_required: !!human, action: human?.action ?? null }
}

export interface ProviderFailureSummary {
  provider: string
  failures: number
  /** The dominant class and how much of the failure volume it accounts for. */
  dominant_class: FailureClass
  dominant_share: number
  action_required: boolean
  action: string | null
  by_class: Array<{ klass: FailureClass; count: number }>
  first_seen: string | null
  last_seen: string | null
}

/**
 * Roll failed calls up per provider. Deliberately reports the DOMINANT cause rather than a list:
 * "60% of calls are failing" prompts a shrug; "2,401 of them are one unpaid bill, still failing
 * as of an hour ago" prompts an action.
 */
export function summariseProviderFailures(
  rows: Array<{ provider: string | null; success: boolean | null; error_message: string | null; created_at?: string | null }>,
): ProviderFailureSummary[] {
  const byProvider = new Map<string, { counts: Map<FailureClass, number>; total: number; first: string | null; last: string | null }>()

  for (const r of rows ?? []) {
    if (r?.success !== false) continue
    const provider = r.provider ?? 'unknown'
    let bucket = byProvider.get(provider)
    if (!bucket) { bucket = { counts: new Map(), total: 0, first: null, last: null }; byProvider.set(provider, bucket) }
    const { klass } = classifyProviderFailure(r.error_message)
    bucket.counts.set(klass, (bucket.counts.get(klass) ?? 0) + 1)
    bucket.total++
    const ts = r.created_at ?? null
    if (ts) {
      if (!bucket.first || ts < bucket.first) bucket.first = ts
      if (!bucket.last || ts > bucket.last) bucket.last = ts
    }
  }

  return [...byProvider.entries()]
    .map(([provider, b]) => {
      const sorted = [...b.counts.entries()].sort((x, y) => y[1] - x[1])
      const [dominant, dominantCount] = sorted[0] ?? ['unknown' as FailureClass, 0]
      const cls = classifyProviderFailure(dominant === 'billing_credit' ? 'credit balance is too low' : dominant === 'auth' ? '401 unauthorized' : dominant === 'bad_request' ? '400 invalid_request' : '')
      return {
        provider,
        failures: b.total,
        dominant_class: dominant,
        dominant_share: b.total > 0 ? Math.round((dominantCount / b.total) * 100) / 100 : 0,
        action_required: cls.action_required && dominant === cls.klass,
        action: cls.klass === dominant ? cls.action : null,
        by_class: sorted.map(([klass, count]) => ({ klass, count })),
        first_seen: b.first,
        last_seen: b.last,
      }
    })
    .sort((a, b) => b.failures - a.failures)
}
