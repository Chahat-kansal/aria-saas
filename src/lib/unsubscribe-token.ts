// MSG-COMPLIANCE-2 — signed, tamper-proof unsubscribe tokens for the email List-Unsubscribe URL.
// The token carries business + customer/email identifiers (uuids preferred — no raw PII in the URL
// when a customerId is available) and an HMAC-SHA256 signature, so a random/forged token can't
// suppress an arbitrary address. Shared by sendEmail (mints) and the email-unsubscribe webhook (verifies).
import { createHmac, timingSafeEqual } from 'crypto'

export interface UnsubPayload {
  b: string | null            // business_id
  c?: string | null           // customer_id (preferred — opaque uuid)
  e?: string | null           // email (only when no customerId available)
}

function secret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.CRON_SECRET ??
    'aria-unsubscribe-dev-secret'
  )
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export function signUnsubToken(p: UnsubPayload): string {
  const payload = b64url(Buffer.from(JSON.stringify(p)))
  const sig = b64url(createHmac('sha256', secret()).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifyUnsubToken(token: string | null | undefined): UnsubPayload | null {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = b64url(createHmac('sha256', secret()).update(payload).digest())
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(b64urlDecode(payload).toString('utf8')) as UnsubPayload
  } catch {
    return null
  }
}
