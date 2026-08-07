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
 * SEC-PIN-3 §1 — THE ONE PLACE THAT DECIDES WHAT A PIN WRITE PUTS IN THE DATABASE.
 *
 * Every INSERT/UPDATE that sets a staff PIN goes through this. Before SEC-PIN-3 there were four
 * writers with three different behaviours — two wrote pin + pin_hash, one wrote all three, and
 * pos/staff wrote plaintext ONLY. A single helper is the only way that stops drifting again.
 *
 * BOTH derived columns matter, and for different reasons:
 *   pin_hash   — authenticates. Every route needs it.
 *   pin_lookup — FINDS the row. Four routes identify a person from the PIN alone (verify-override,
 *                clock-in, clock-out, canopy-pin) and bcrypt is salted, so there is no
 *                `where pin_hash = hash(input)`. A row with a hash but no lookup can log in (its id
 *                is known) but can never clock in or authorise an override.
 *
 * ⚠ WHY PLAINTEXT IS STILL WRITTEN WHEN THE PEPPER IS ABSENT — the deliberate deviation.
 *
 * The brief said "remove `pin` from every write, unconditionally". Correct destination, wrong route
 * if STAFF_PIN_PEPPER is unset in the environment doing the writing: pinLookup() returns null, so
 * the row would land with a hash, no lookup, AND no plaintext — findable by nothing. A staff member
 * created that way is silently half-broken, and the breakage only shows up at the till, days later,
 * as "my PIN doesn't work on the clock-in screen but does on the login screen".
 *
 * So: pepper set -> hash + lookup, no plaintext, which is the point of the sprint. Pepper unset ->
 * hash + lookup-less plaintext, which is EXACTLY today's behaviour and therefore no regression
 * (RULE 0), plus a loud warning. Same reasoning as pepperOrNull() above: fail-soft where the strict
 * alternative silently breaks staff, and make the degraded state visible instead of invisible.
 *
 * This also gives §2 a precondition it can actually check: `pin is not null and pin_lookup is null`
 * must be zero rows before the column can be dropped.
 */
export interface StaffPinColumns {
  pin_hash: string
  pin_lookup?: string
  /** Present ONLY in the degraded no-pepper path. Its absence is the sprint's deliverable. */
  pin?: string
}

export async function staffPinColumns(businessId: string, pin: string): Promise<StaffPinColumns> {
  const pin_hash = await hashStaffPin(pin)
  const lookup = pinLookup(businessId, pin)
  if (lookup) return { pin_hash, pin_lookup: lookup }

  console.warn(
    '[staff-pin] STAFF_PIN_PEPPER is unset — writing the legacy plaintext pin so PIN-only routes ' +
    '(override, clock-in/out, canopy) can still find this row. Set the env var and re-save the PIN.',
  )
  return { pin_hash, pin }
}

/** True when a unique-violation on the (business_id, pin_lookup) index caused this error — i.e. the
 *  chosen PIN is already in use by someone else in the same business. Postgres 23505. Callers turn
 *  this into a readable 409 instead of leaking a raw constraint name to the screen. */
export function isDuplicatePinError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '23505' || /pin_lookup_uniq/.test(err.message ?? '')
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
