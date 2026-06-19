import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { randomBytes, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { decryptCustomerPII } from '@/lib/aria/customer-pii'

// LOY-P1-IDENTITY — passwordless email+PIN identity for loyalty customers.
// Mirrors the community session pattern (httpOnly cookie → server-side token row),
// but the secret material (pin_hash, otp_hash, session_token) lives in the separate,
// RLS-locked pos_customer_auth table — never on pos_customers, so an owner/public
// `select` on pos_customers can never reach it.

export const LOYALTY_COOKIE = 'aria_loyalty_session'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1 year

export function genToken(): string {
  return randomBytes(32).toString('base64url')
}

/** 6-digit numeric OTP, zero-padded. */
export function genOtp(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

/** OTP/invite tokens are stored hashed (sha256) — never in plaintext, never logged. */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try { return await bcrypt.compare(pin, hash) } catch { return false }
}

/** PIN policy: exactly 6 digits. Rejects trivial all-same / sequential PINs. */
export function isValidPin(pin: unknown): pin is string {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return false
  if (/^(\d)\1{5}$/.test(pin)) return false // 000000, 111111…
  if (pin === '123456' || pin === '654321') return false
  return true
}

export function normaliseEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

export interface LoyaltyCustomer {
  customer_id: string
  business_id: string
  name: string | null
  email: string
}

/**
 * Resolve the signed-in loyalty customer from the cookie. Returns exactly their own
 * row (joined by the session token) or null. Never creates a session.
 */
export async function getLoyaltyCustomer(): Promise<LoyaltyCustomer | null> {
  const store = await cookies()
  const token = store.get(LOYALTY_COOKIE)?.value
  if (!token) return null

  const { data: auth } = await supabaseAdmin
    .from('pos_customer_auth')
    .select('customer_id, business_id, email')
    .eq('session_token', token)
    .maybeSingle()
  if (!auth?.customer_id) return null

  const { data: cust } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, name_enc')
    .eq('id', auth.customer_id as string)
    .maybeSingle()

  let name = (cust?.name as string | null) ?? null
  if (cust) {
    try { name = decryptCustomerPII(cust as Record<string, unknown>, auth.business_id as string).name ?? name } catch { /* keep plaintext */ }
  }

  return {
    customer_id: auth.customer_id as string,
    business_id: auth.business_id as string,
    name,
    email: auth.email as string,
  }
}

/** Issue a fresh session token for an auth row and set the cookie (login / set-PIN success). */
export async function setLoyaltySession(authId: string): Promise<void> {
  const token = genToken()
  await supabaseAdmin
    .from('pos_customer_auth')
    .update({ session_token: token, updated_at: new Date().toISOString() })
    .eq('id', authId)

  const store = await cookies()
  store.set({
    name: LOYALTY_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
}

/** Forget the current session (logout). Clears both the server token and the cookie. */
export async function clearLoyaltySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(LOYALTY_COOKIE)?.value
  if (token) {
    await supabaseAdmin.from('pos_customer_auth').update({ session_token: null }).eq('session_token', token)
  }
  store.set({ name: LOYALTY_COOKIE, value: '', maxAge: 0, path: '/' })
}
