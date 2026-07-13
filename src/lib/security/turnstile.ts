// SECURITY-P1 — Cloudflare Turnstile server-side verification for public unauthenticated forms.
// Fail-CLOSED when TURNSTILE_SECRET_KEY is configured (a missing/invalid token is rejected).
// Fail-OPEN (with a logged MONITOR-1 warning) when the secret is absent — so a missing env var in
// preview/dev environments, or before the founder has configured it, can never brick signup/booking/
// contact/order forms. This mirrors the exact fail-open/fail-closed split cost.ts's rate limiter
// already established for a missing-config scenario (fail open only where "unconfigured" != "attack").
let warnedMissingSecret = false

export interface TurnstileResult {
  ok: boolean
  reason?: 'missing_token' | 'missing_secret_fail_open' | 'verify_failed' | 'verify_error'
}

export async function verifyTurnstile(token: string | undefined | null, remoteIp?: string | null): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (!warnedMissingSecret) {
      console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — Turnstile verification is DISABLED (fail-open). Set it in Vercel to enable bot protection on public forms.')
      warnedMissingSecret = true
      try {
        const { sendAlert } = await import('@/lib/monitoring/alert')
        void sendAlert({
          title: 'Turnstile not configured',
          summary: 'TURNSTILE_SECRET_KEY is unset — public forms (signup, contact, booking, order) are accepting submissions with no bot verification.',
          severity: 'normal',
        })
      } catch { /* alert is best-effort, never block the request over it */ }
    }
    return { ok: true, reason: 'missing_secret_fail_open' }
  }

  if (!token) return { ok: false, reason: 'missing_token' }

  try {
    const body = new URLSearchParams({ secret, response: token })
    if (remoteIp) body.set('remoteip', remoteIp)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8_000),
    })
    const data = await res.json() as { success?: boolean }
    return data.success ? { ok: true } : { ok: false, reason: 'verify_failed' }
  } catch (e) {
    console.error('[turnstile] siteverify request failed:', e instanceof Error ? e.message : String(e))
    // A network error talking to Cloudflare is NOT the same as a failed/absent token — fail closed
    // regardless (can't prove the request is legitimate), but this is logged distinctly so a
    // Cloudflare outage is diagnosable rather than looking like a wave of bot traffic.
    return { ok: false, reason: 'verify_error' }
  }
}

/** Convenience: returns a 403 NextResponse when verification fails, or null when the request may proceed. */
export async function requireTurnstile(token: string | undefined | null, remoteIp?: string | null) {
  const { NextResponse } = await import('next/server')
  const result = await verifyTurnstile(token, remoteIp)
  if (result.ok) return null
  return NextResponse.json({ error: 'Verification failed — please try again.' }, { status: 403 })
}
