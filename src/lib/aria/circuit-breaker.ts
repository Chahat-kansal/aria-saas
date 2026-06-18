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

/** Transient = worth failing-over and worth tripping the breaker. Hard errors (auth/billing/quota
 *  config) are NOT transient — those must surface so an engineer fixes them, not be masked by failover. */
export function isTransientError(msg: string | null | undefined): boolean {
  const m = (msg ?? '').toLowerCase()
  if (!m) return false
  // Auth/config problems are explicitly NOT transient.
  if (/invalid x-api-key|authentication|unauthorized|401|permission|billing|credit balance|quota/.test(m)) return false
  return /529|503|500|overload|rate.?limit|429|timed out|timeout|econnreset|etimedout|socket hang up|fetch failed|network|aborted|service unavailable/.test(m)
}

/** Is the Anthropic circuit currently OPEN? Returns the open incident id when so. */
export async function isAnthropicCircuitOpen(): Promise<{ open: boolean; incidentId?: string }> {
  try {
    const sinceIso = new Date(Date.now() - OPEN_SEC * 1000).toISOString()
    const { data } = await supabaseAdmin
      .from('aria_provider_incidents')
      .select('id, started_at')
      .eq('provider', PROVIDER)
      .is('resolved_at', null)
      .gte('started_at', sinceIso)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.id ? { open: true, incidentId: data.id as string } : { open: false }
  } catch {
    return { open: false } // never block Aria on a state-read hiccup
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
