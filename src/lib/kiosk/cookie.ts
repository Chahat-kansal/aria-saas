// SECURITY-P2 — session hygiene review found ariakiosk_${business_id} was a bare unsigned
// literal ('1'), backed by no DB row. business_id is a UUID visible in every public /in-store/
// URL, so anyone could set document.cookie = "ariakiosk_<biz>=1" themselves and pass every
// downstream "must have redeemed a real kiosk QR/tablet key" check (instore/loyalty, instore/
// recipe, scan-and-go/cart, scan-and-go/finish) for any business.
//
// Fail-open (+ logged MONITOR-1-style warning, once) when KIOSK_SESSION_SECRET is unset — same
// pattern as src/lib/security/turnstile.ts's TURNSTILE_SECRET_KEY: falls back to the exact old
// presence-only check, so a missing env var can never brick the live in-store ordering flow.
// Fail-closed (reject unsigned/expired/tampered cookies) once the secret is configured.
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

let warnedMissingSecret = false

function secret(): string | null {
  const s = process.env.KIOSK_SESSION_SECRET
  if (s) return s
  if (!warnedMissingSecret) {
    warnedMissingSecret = true
    console.warn('[kiosk] KIOSK_SESSION_SECRET not set — kiosk session cookie is UNSIGNED (forgeable by business_id). Set it in Vercel to harden.')
    void import('@/lib/monitoring/alert')
      .then(({ sendAlert }) => sendAlert({
        title: 'Kiosk session cookie unsigned',
        summary: 'KIOSK_SESSION_SECRET is unset — the ariakiosk_{business_id} cookie is a bare presence check, forgeable by anyone who knows a business_id.',
        severity: 'normal',
      }))
      .catch(() => { /* best-effort */ })
  }
  return null
}

/** Value to store in the ariakiosk_${businessId} cookie. Signed if KIOSK_SESSION_SECRET is set, else the legacy '1'. */
export function signKioskValue(businessId: string, maxAgeSeconds: number): string {
  const s = secret()
  if (!s) return '1'
  const exp = Date.now() + maxAgeSeconds * 1000
  const sig = createHmac('sha256', s).update(businessId + '.' + exp).digest('hex')
  return exp + '.' + sig
}

/** True if the caller holds a valid (unforged, unexpired) kiosk session for businessId. */
export function hasValidKioskSession(businessId: string): boolean {
  const raw = cookies().get(`ariakiosk_${businessId}`)?.value
  if (!raw) return false
  const s = secret()
  if (!s) return true // legacy behavior: presence-only, unchanged when unconfigured

  const dot = raw.indexOf('.')
  if (dot < 0) return false
  const expPart = raw.slice(0, dot)
  const sigPart = raw.slice(dot + 1)
  const exp = Number(expPart)
  if (!Number.isFinite(exp) || Date.now() > exp) return false

  const expected = createHmac('sha256', s).update(businessId + '.' + expPart).digest('hex')
  const a = Buffer.from(sigPart)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
