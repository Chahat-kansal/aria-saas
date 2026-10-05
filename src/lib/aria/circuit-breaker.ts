// API-RESILIENCE-1 — Anthropic circuit breaker.
//
// Goal: when Anthropic is having an outage, stop hammering it (each tool-loop request can burn the
// full 30–55s timeout) and route Aria straight to the fallback providers instead.
//
// Storage (reuses what already exists — no new infra beyond aria_provider_incidents):
//   • Failure COUNTING → the atomic Supabase rate_limit_hit() RPC (key = circuit-fail:anthropic).
//   • Circuit STATE + audit log → aria_provider_incidents (an unresolved row started <OPEN_SEC ago
//     means the circuit is OPEN). The same row records WHICH fallback provider served Aria.
//
// Lifecycle:
//   transient failures (>=THRESHOLD within WINDOW) → open incident inserted (circuit OPEN for OPEN_SEC)
//   → while OPEN the ask route skips the Anthropic tool-loop entirely
//   → after OPEN_SEC the circuit auto-probes again (a fresh tool-loop attempt)
//   → a real Anthropic success resolves the open incident (circuit CLOSED).
//
// Everything here is best-effort: a storage hiccup must never break Aria, so failures fall through
// to "circuit closed / not tripped" (availability over strictness).
import { supabaseAdmin } from '@/lib/supabase-admin'
import { rateLimit } from '@/lib/security/rate-limit'

const PROVIDER = 'anthropic'
// rate_limit_hit() allows up to the limit and blocks the NEXT hit, so a limit of 2 means the
// 3rd transient failure within the window opens the circuit ("3 strikes").
const FAIL_THRESHOLD = 2      // 2 pass; the 3rd transient failure...
const FAIL_WINDOW_SEC = 300   // ...within 5 minutes opens the circuit
const OPEN_SEC = 120          // circuit stays open for 2 minutes, then re-probes

/**
 * M18B PHASE 1 — HOW LONG A **HARD** PROVIDER FAULT STAYS DOWN, AND WHY IT IS NOT 120 SECONDS.
 *
 * `OPEN_SEC` is tuned for a transient fault: a 529, a timeout, an overload. Re-probing after two
 * minutes is right for those, because they usually clear on their own.
 *
 * A credit-balance rejection and an auth-resolution failure clear when a **human** does something.
 * Re-probing them every two minutes is how 346 Claude calls were attempted since 21 September for
 * **zero** successes — measured, not estimated. So hard faults get their own, much longer TTL.
 *
 * ⚠️ CONFIGURABLE, NOT HARD-CODED, and the default is 60 minutes as the sprint specifies. The cost of
 * the longer window is that a top-up takes up to this long to be noticed; `recordAnthropicSuccess()`
 * closes the incident on the first success after it, so recovery is automatic, just not instant.
 */
const HARD_OPEN_SEC = Math.max(60, Number(process.env.ARIA_PROVIDER_HARD_DOWN_SEC) || 3600)

/**
 * M18B PHASE 1 — A FAULT ONLY A HUMAN CAN CLEAR.
 *
 * ⚠️ DELIBERATELY NARROWER THAN BOTH EXISTING CLASSIFIERS, and the three must not be collapsed:
 *
 *   · `isTransientError()`      — worth retrying. EXCLUDES billing/auth so they surface to an engineer.
 *   · `isAnthropicUnreachable()` — worth failing over. INCLUDES billing/auth *and* 429/5xx/timeouts.
 *   · `isHardProviderError()`    — this one. Billing/auth ONLY, never a 429 or a timeout.
 *
 * The sprint is explicit that a 429 or a timeout must keep its existing retry behaviour, and that is
 * exactly what the exclusion below protects. A rate limit clears by waiting; an empty balance does not.
 */
export function isHardProviderError(msg: string | null | undefined): boolean {
  const m = (msg ?? '').toLowerCase()
  if (!m) return false
  // A rate limit or an overload is NOT a hard fault, even when the same call also mentions billing.
  if (/429|rate.?limit|529|503|overload|timed out|timeout|econnreset|etimedout|socket hang up|service unavailable/.test(m)) return false
  return /credit balance|insufficient|billing|quota|payment|could not resolve authentication|invalid x-api-key|unauthorized|401|403/.test(m)
}

/** Transient = worth failing-over and worth tripping the breaker. Hard errors (auth/billing/quota
 *  config) are NOT transient — those must surface so an engineer fixes them, not be masked by failover. */
export function isTransientError(msg: string | null | undefined): boolean {
  const m = (msg ?? '').toLowerCase()
  if (!m) return false
  // Auth/config problems are explicitly NOT transient.
  if (/invalid x-api-key|authentication|unauthorized|401|permission|billing|credit balance|quota/.test(m)) return false
  return /529|503|500|overload|rate.?limit|429|timed out|timeout|econnreset|etimedout|socket hang up|fetch failed|network|aborted|service unavailable/.test(m)
}

/**
 * ASK-ARIA-COST-AND-FALLBACK (FIX 1): is the WHOLE Anthropic provider unreachable (not a single-model blip)?
 * This is the superset that should trigger CROSS-PROVIDER failover (→ Gemini) and skip re-hitting Anthropic:
 * out-of-credit/billing (the real bug), auth (401/403), rate-limit (429), and repeated 5xx/timeout/network.
 * Distinct from isTransientError (which deliberately excludes billing/auth so they trip an engineer, not a
 * customer-facing 500) — here we treat them as "provider down, fail over gracefully" so the owner still gets
 * an answer from Gemini instead of an error.
 */
export function isAnthropicUnreachable(msg: string | null | undefined): boolean {
  const m = (msg ?? '').toLowerCase()
  if (!m) return false
  return /credit balance|billing|quota|insufficient|payment|401|403|unauthorized|authentication|invalid x-api-key|permission|429|rate.?limit|529|503|500|overload|timed out|timeout|econnreset|etimedout|socket hang up|fetch failed|network|aborted|service unavailable/.test(m)
}

/**
 * Is the Anthropic circuit currently OPEN? Returns the open incident id when so.
 *
 * ⚠️ M18B PHASE 1 — TWO WINDOWS, CHOSEN BY WHAT OPENED THE INCIDENT.
 *
 * The widest window is read first and each candidate is then judged against the window that applies
 * to IT: a hard incident (`isHardProviderError(trigger_error)`) counts as open for `HARD_OPEN_SEC`, a
 * transient one for `OPEN_SEC`, exactly as before. `trigger_error` is already on the row, so this
 * needed no schema change — the classification is done at read time.
 *
 * Behaviour for transient faults is **unchanged**: a 529 from three minutes ago still reads closed.
 */
export async function isAnthropicCircuitOpen(): Promise<{ open: boolean; incidentId?: string; hard?: boolean }> {
  try {
    const widest = Math.max(OPEN_SEC, HARD_OPEN_SEC)
    const sinceIso = new Date(Date.now() - widest * 1000).toISOString()
    const { data, error } = await supabaseAdmin
      .from('aria_provider_incidents')
      .select('id, started_at, trigger_error')
      .eq('provider', PROVIDER)
      .is('resolved_at', null)
      .gte('started_at', sinceIso)
      .order('started_at', { ascending: false })
      .limit(5)
    // WALL 6 — a failed read here reads as "circuit closed", which sends the next turn back at a dead
    // provider. Non-fatal by design (availability over strictness) but no longer silent.
    if (error) console.error('[circuit-breaker] open-state read failed:', error.message)

    const now = Date.now()
    for (const row of (data ?? []) as Array<{ id: string; started_at: string; trigger_error: string | null }>) {
      const ageSec = (now - new Date(row.started_at).getTime()) / 1000
      const hard = isHardProviderError(row.trigger_error)
      const ttl = hard ? HARD_OPEN_SEC : OPEN_SEC
      if (ageSec <= ttl) return { open: true, incidentId: row.id, hard }
    }
    return { open: false }
  } catch {
    return { open: false } // never block Aria on a state-read hiccup
  }
}

/**
 * M18B PHASE 1 — A HARD FAULT OPENS THE CIRCUIT ON THE **FIRST** OCCURRENCE.
 *
 * `recordAnthropicFailure()` deliberately waits for three strikes in five minutes, which is right for
 * a flaky provider. It is wrong here: one `400 … "Your credit balance is too low"` is **deterministic
 * proof**. Waiting for two more is paying the latency of two more round-trips to be told the same
 * thing. So this skips the threshold entirely.
 *
 * It reuses an already-open incident rather than stacking rows, and it is **observable**: one
 * `console.warn` per transition, carrying the reason. Not a silent variable.
 */
export async function recordAnthropicHardDown(triggerError: string): Promise<{ tripped: boolean; incidentId?: string }> {
  try {
    const existing = await isAnthropicCircuitOpen()
    // Already open on a hard fault — nothing to transition, and no second log line for one outage.
    if (existing.open && existing.hard) return { tripped: true, incidentId: existing.incidentId }

    const { data, error } = await supabaseAdmin
      .from('aria_provider_incidents')
      .insert({ provider: PROVIDER, trigger_error: (triggerError ?? '').slice(0, 500) })
      .select('id')
      .single()
    if (error) {
      // W6 — a discarded error here means the circuit silently never opens, which is the bug this
      // whole phase exists to fix.
      console.error('[circuit-breaker] could not open a HARD incident:', error.message)
      return { tripped: false }
    }
    console.warn(
      '[circuit-breaker] Anthropic marked HARD DOWN for ' + HARD_OPEN_SEC + 's (first occurrence, no '
      + 'threshold — a human has to clear this): ' + (triggerError ?? '').slice(0, 160),
    )
    return { tripped: true, incidentId: (data?.id as string) ?? undefined }
  } catch (e) {
    console.error('[circuit-breaker] recordAnthropicHardDown error:', (e as Error).message)
    return { tripped: false }
  }
}

/** Record a transient Anthropic failure. If it crosses the threshold within the window, open the
 *  circuit (insert an incident) — unless one is already open. Returns the open incident id if tripped. */
export async function recordAnthropicFailure(triggerError: string): Promise<{ tripped: boolean; incidentId?: string }> {
  try {
    // Count failures in the rolling window via the atomic RPC.
    const r = await rateLimit(`circuit-fail:${PROVIDER}`, FAIL_THRESHOLD, FAIL_WINDOW_SEC)
    if (r.allowed) return { tripped: false } // still under threshold

    // Threshold crossed — trip the circuit, but reuse an already-open incident if present.
    const existing = await isAnthropicCircuitOpen()
    if (existing.open) return { tripped: true, incidentId: existing.incidentId }

    const { data } = await supabaseAdmin
      .from('aria_provider_incidents')
      .insert({ provider: PROVIDER, trigger_error: (triggerError ?? '').slice(0, 500) })
      .select('id')
      .single()
    console.warn('[circuit-breaker] Anthropic circuit OPENED:', triggerError?.slice(0, 120))
    return { tripped: true, incidentId: (data?.id as string) ?? undefined }
  } catch (e) {
    console.error('[circuit-breaker] recordFailure error:', (e as Error).message)
    return { tripped: false }
  }
}

/** Stamp which provider served as the fallback for an open incident (visibility in the incident log). */
export async function recordAnthropicFallbackProvider(incidentId: string, provider: string): Promise<void> {
  if (!incidentId || !provider || provider === 'none') return
  try {
    await supabaseAdmin
      .from('aria_provider_incidents')
      .update({ fallback_provider_used: provider })
      .eq('id', incidentId)
      .is('resolved_at', null)
  } catch (e) {
    console.error('[circuit-breaker] recordFallbackProvider error:', (e as Error).message)
  }
}

/** API-RESILIENCE-1B — the rare terminal case: EVERY provider is down. Ensure an incident exists and
 *  mark it 'none_all_down' so total outages are distinguishable from ordinary single-provider failovers.
 *  Reuses an already-open incident if present; otherwise inserts one. Best-effort. */
export async function recordTotalOutage(triggerError: string): Promise<void> {
  try {
    const open = await isAnthropicCircuitOpen()
    if (open.open && open.incidentId) {
      await supabaseAdmin
        .from('aria_provider_incidents')
        .update({ fallback_provider_used: 'none_all_down' })
        .eq('id', open.incidentId)
        .is('resolved_at', null)
    } else {
      await supabaseAdmin
        .from('aria_provider_incidents')
        .insert({
          provider: PROVIDER,
          fallback_provider_used: 'none_all_down',
          trigger_error: ('ALL PROVIDERS DOWN: ' + (triggerError ?? '')).slice(0, 500),
        })
    }
    console.error('[circuit-breaker] TOTAL OUTAGE — all AI providers down')
  } catch (e) {
    console.error('[circuit-breaker] recordTotalOutage error:', (e as Error).message)
  }
}

/** A real Anthropic success — resolve any open incident (circuit CLOSED). Best-effort. */
export async function recordAnthropicSuccess(): Promise<void> {
  try {
    const open = await isAnthropicCircuitOpen()
    if (!open.open || !open.incidentId) return
    await supabaseAdmin
      .from('aria_provider_incidents')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', open.incidentId)
      .is('resolved_at', null)
    console.info('[circuit-breaker] Anthropic circuit CLOSED (recovered)')
  } catch (e) {
    console.error('[circuit-breaker] recordSuccess error:', (e as Error).message)
  }
}
