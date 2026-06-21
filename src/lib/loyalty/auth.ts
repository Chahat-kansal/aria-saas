import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { randomBytes, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { decryptCustomerPII } from '@/lib/aria/customer-pii'

// LOY-NETWORK — GLOBAL loyalty identity (one email + PIN + barcode, business-agnostic) that links
// to many per-business MEMBERSHIPS (the existing pos_customers rows). Identity secrets (pin_hash,
// otp_hash, session_token, redeem_token) live on the RLS-locked loyalty_identity table — never on
// pos_customers. Points/tier/stamps stay per-business on each membership. (Replaces the LOY-P1
// per-business pos_customer_auth model; that table is empty and left in place, deprecated.)

export const LOYALTY_COOKIE = 'aria_loyalty_session'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1 year

export function genToken(): string {
  return randomBytes(32).toString('base64url')
}

/** 6-digit numeric OTP, zero-padded. */
export function genOtp(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

/** OTP/redeem tokens are stored hashed (sha256) — never plaintext, never logged. */
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

export interface LoyaltyIdentity {
  id: string
  email: string
}

export interface LoyaltyMembership {
  identity_id: string
  customer_id: string
  business_id: string
  name: string | null
  email: string
}

/** Resolve the global signed-in identity from the cookie. No business context. */
export async function getLoyaltyIdentity(): Promise<LoyaltyIdentity | null> {
  const store = await cookies()
  const token = store.get(LOYALTY_COOKIE)?.value
  if (!token) return null
  const { data } = await supabaseAdmin
    .from('loyalty_identity')
    .select('id, email')
    .eq('session_token', token)
    .maybeSingle()
  if (!data?.id) return null
  return { id: data.id as string, email: data.email as string }
}

/**
 * Resolve the signed-in identity's MEMBERSHIP at a specific business (the pos_customers row linked
 * to this identity for that business). Returns null if not signed in OR not a member there. The
 * lookup is scoped to the identity, so a customer can only ever resolve their OWN membership.
 */
export async function getLoyaltyMembership(businessId: string): Promise<LoyaltyMembership | null> {
  const identity = await getLoyaltyIdentity()
  if (!identity || !businessId) return null
  const { data: cust } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, name_enc')
    .eq('loyalty_identity_id', identity.id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!cust?.id) return null
  let name = (cust.name as string | null) ?? null
  try { name = decryptCustomerPII(cust as Record<string, unknown>, businessId).name ?? name } catch { /* keep plaintext */ }
  return { identity_id: identity.id, customer_id: cust.id as string, business_id: businessId, name, email: identity.email }
}

/** Issue a fresh session token for an identity and set the cookie (login / set-PIN / accept-invite). */
export async function setLoyaltySession(identityId: string): Promise<void> {
  const token = genToken()
  await supabaseAdmin
    .from('loyalty_identity')
    .update({ session_token: token, updated_at: new Date().toISOString() })
    .eq('id', identityId)

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

/** Forget the current session (logout). Clears the server token and the cookie. */
export async function clearLoyaltySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(LOYALTY_COOKIE)?.value
  if (token) {
    await supabaseAdmin.from('loyalty_identity').update({ session_token: null }).eq('session_token', token)
  }
  store.set({ name: LOYALTY_COOKIE, value: '', maxAge: 0, path: '/' })
}
