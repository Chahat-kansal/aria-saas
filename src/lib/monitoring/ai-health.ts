// AI-HEALTH-1 — decide when the AI provider layer is unhealthy enough to wake someone.
//
// WHY THIS EXISTS: Aria's brain was substantially dead in production for weeks and nothing
// surfaced it. 1,605 of the last 30 days' failures are one cause — Anthropic 400 "Your credit
// balance is too low" — across ask_aria, business_brain_daily, the whole council, hypothesis_engine,
// memory_extractor and more. The only surface that reads aria_ai_calls filters
// `.gt('cost_usd_cents', 0)`, and a failed call costs $0, so every failure was invisible by
// construction.
//
// Pure function on purpose: a threshold nobody can test is a threshold that silently stops firing.

export interface ProviderHealthRow {
  provider: string
  total_calls: number
  failures: number
  /** Most common error string for this provider, verbatim. */
  top_error: string | null
  /** Distinct agent_key values that saw a failure — this is what turns "some calls failed" into
   *  "the brain is off". */
  agents_affected: number
}

export interface HealthAlert {
  provider: string
  severity: 'high' | 'medium'
  reason: 'auth_or_credit' | 'failure_rate'
  failures: number
  failureRate: number
  topError: string | null
  agentsAffected: number
}

/** Minimum call volume before a RATE is meaningful. Three failures out of four is noise. */
export const MIN_CALLS_FOR_RATE = 20
/** Failure-rate threshold, as a fraction. */
export const FAILURE_RATE_THRESHOLD = 0.20

/**
 * Errors that mean the ACCOUNT is down, not that a request was unlucky.
 *
 * These escalate on a SINGLE occurrence, deliberately bypassing the rate threshold: one credit
 * error means every agent is degraded right now. Waiting for a 20% rate to accumulate is how this
 * went unnoticed for weeks — the failures were there from day one, they just never crossed a bar
 * that nobody was watching anyway.
 */
const AUTH_OR_CREDIT = /credit balance|insufficient|quota|\b401\b|\b403\b/i

/**
 * Returns one alert per unhealthy provider, or [] when everything is fine.
 * Zero-call providers return nothing — no divide-by-zero, and "no traffic" is not "unhealthy".
 */
export function shouldAlert(rows: ProviderHealthRow[]): HealthAlert[] {
  const out: HealthAlert[] = []

  for (const r of rows) {
    if (!r.total_calls || r.total_calls <= 0) continue          // no traffic is not a failure
    const failureRate = r.failures / r.total_calls

    // Account-level failure: escalate on one, regardless of rate.
    if (r.top_error && AUTH_OR_CREDIT.test(r.top_error)) {
      out.push({
        provider: r.provider, severity: 'high', reason: 'auth_or_credit',
        failures: r.failures, failureRate, topError: r.top_error, agentsAffected: r.agents_affected,
      })
      continue
    }

    if (r.total_calls >= MIN_CALLS_FOR_RATE && failureRate > FAILURE_RATE_THRESHOLD) {
      out.push({
        provider: r.provider, severity: 'medium', reason: 'failure_rate',
        failures: r.failures, failureRate, topError: r.top_error, agentsAffected: r.agents_affected,
      })
    }
  }

  return out
}

/** Stable per-provider-per-day key, so a persistent outage alerts once a day rather than hourly. */
export function alertDedupeKey(provider: string, ymd: string): string {
  return 'ai-health:' + provider + ':' + ymd
}
