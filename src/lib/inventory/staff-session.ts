import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

// INV-STAFF-APP-1 — the acting-staff session for the inventory PWA. A stateless HMAC-signed cookie holds
// {business_id, staff_id, staff_name} so later prompts can attribute every count/movement to a real person.
// The PIN is validated server-side and NEVER stored in the cookie. Forgery needs the server secret.

export const STAFF_COOKIE = 'aria_inv_staff'
const TTL_SECONDS = 60 * 60 * 12 // a shift

interface StaffPayload { b: string; s: string; n: string; exp: number }
export interface ActingStaff { business_id: string; staff_id: string; staff_name: string }

function secret(): string {
  return process.env.INV_STAFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only-secret'
}
function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function sign(data: string): string {
  return b64url(createHmac('sha256', secret()).update(data).digest())
}

export function makeToken(businessId: string, staffId: string, staffName: string): string {
  const payload: StaffPayload = { b: businessId, s: staffId, n: staffName, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

export function verifyToken(token: string | undefined | null): ActingStaff | null {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const expected = sign(body)
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as StaffPayload
    if (!payload.b || !payload.s || (payload.exp ?? 0) < Math.floor(Date.now() / 1000)) return null
    return { business_id: payload.b, staff_id: payload.s, staff_name: payload.n }
  } catch { return null }
}

export async function setStaffCookie(businessId: string, staffId: string, staffName: string): Promise<void> {
  const store = await cookies()
  store.set({ name: STAFF_COOKIE, value: makeToken(businessId, staffId, staffName), httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TTL_SECONDS })
}
export async function clearStaffCookie(): Promise<void> {
  const store = await cookies()
  store.set({ name: STAFF_COOKIE, value: '', maxAge: 0, path: '/' })
}
/** Read + verify the acting staff; ensure it matches the expected business (anti cross-business). */
export async function getActingStaff(expectedBusinessId?: string): Promise<ActingStaff | null> {
  const store = await cookies()
  const acting = verifyToken(store.get(STAFF_COOKIE)?.value)
  if (!acting) return null
  if (expectedBusinessId && acting.business_id !== expectedBusinessId) return null
  return acting
}
