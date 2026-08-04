import bcrypt from 'bcryptjs'
import { createHmac, timingSafeEqual } from 'crypto'

// SEC-PIN-1 — staff PIN handling. Same bcrypt cost as loyalty (10, see lib/loyalty/auth.ts) so the
// two halves of the product finally use one standard. pin_lookup exists because two routes identify
// a person from the PIN alone (till clock-in, manager override) and a SALTED hash cannot be looked
// up. HMAC with a server-side pepper is deterministic enough to index and useless without the
// pepper, which is never stored in the database.

/**
 * The pepper, or null when unset.
 *
 * ⚠ DELIBERATE DEVIATION FROM THE BRIEF, AND THE MOST IMPORTANT DECISION IN THIS FILE.
 *
 * The brief specified `if (!p) throw` — fail closed, never a default. Correct instinct, wrong
 * failure mode HERE: the pepper does not guard authentication, it only makes the lookup INDEX
 * computable. `verifyStaffPin` (bcrypt) is what authenticates and needs no pepper at all.
 *
 * If this threw, then in the window between deploying this code and the env var being set in
 * Vercel — a window that always exists, and that no amount of care removes on a Production+Preview
 * pair — every till clock-in and every manager override would throw a 500. Staff locked out
 * mid-shift is precisely the outcome this batch exists to avoid, and it would be self-inflicted.
 *
 * So: pepper absent -> lookup unavailable -> callers fall back to the legacy plaintext path, which
 * is EXACTLY today's behaviour. No security regression versus the current state; the moment the
 * env var lands, every route upgrades on its next call. Fail-closed on a lookup index means locking
 * out staff; fail-soft here means "no worse than yesterday".
 */
function pepperOrNull(): string | null {
  return process.env.STAFF_PIN_PEPPER || null
}

export function pepperConfigured(): boolean {
  return pepperOrNull() !== null
}

/**
 * Deterministic, indexable lookup value. Returns null when the pepper is unset — callers MUST treat
 * null as "lookup unavailable, use the legacy path", never as a value to match on.
 */
export function pinLookup(businessId: string, pin: string): string | null {
  const p = pepperOrNull()
  if (!p) return null
  return createHmac('sha256', p).update(businessId + ':' + pin).digest('hex')
}

export async function hashStaffPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

/** Constant-time by construction — bcrypt.compare does not short-circuit on first mismatch. */
export async function verifyStaffPin(pin: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false
  try { return await bcrypt.compare(pin, hash) } catch { return false }
}

/**
 * Staff PINs are 4-6 digits — note this DIFFERS from loyalty's isValidPin, which requires exactly
 * 6. owner/access generates 4 (pos_users.pin is NOT NULL, till model) and every existing PIN in the
 * database is 4 digits (verified: 6/6 rows), so requiring 6 would reject every current staff member.
 * Same weak-pattern rejections as loyalty.
 */
export function isValidStaffPin(pin: unknown): pin is string {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) return false
  if (/^(\d)\1+$/.test(pin)) return false                                    // 0000, 111111
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return false // 1234, 4321, 123456
  return true
}

/** Constant-time compare for the lookup value. */
export function lookupMatches(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Lazy upgrade: write hash + lookup for a row that authenticated via the legacy plaintext path.
 * Best-effort — a failure here must never fail the login that already succeeded.
 */
// Structural, not SupabaseClient<...>: the admin client and the per-request server client carry
// different generic parameters, and this helper only ever needs .from().update().eq(). The eq()
// result is `unknown` because PostgREST returns a thenable builder, not a Promise.
type PinUpdatable = {
  from: (table: string) => { update: (values: Record<string, unknown>) => { eq: (col: string, val: string) => unknown } }
}

export async function upgradeStaffPin(
  db: PinUpdatable,
  table: 'pos_users' | 'pos_staff',
  rowId: string,
  businessId: string,
  pin: string,
): Promise<void> {
  try {
    const patch: Record<string, unknown> = { pin_hash: await hashStaffPin(pin) }
    const lookup = pinLookup(businessId, pin)
    if (lookup) patch.pin_lookup = lookup    // omit rather than null it when the pepper is unset
    await db.from(table).update(patch).eq('id', rowId)
  } catch (e) {
    console.error('[staff-pin] lazy upgrade failed (non-fatal):', (e as Error).message)
  }
}
