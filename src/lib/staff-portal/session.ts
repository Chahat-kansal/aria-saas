// SECURITY-P1 (C-08) — staff-portal session issuance/verification. The raw OTP used to double as
// the bearer session token (returned to the client and accepted verbatim as x-portal-token on every
// subsequent request), with no rate limiting downstream of /verify — a 10^6-space brute-force with
// no throttle on /shifts or /leave. This module replaces that with two distinct, correctly-scoped
// credentials:
//   1. The OTP itself (staff_members.portal_otp_hash) — short-lived (30 min), single-use, hashed,
//      only ever used to prove "I received the email" at /verify.
//   2. The session token (staff_portal_sessions.token_hash) — issued only after OTP verification
//      succeeds, a cryptographically random 32-byte value, only its hash stored, 4h TTL.
// Note: staff_members.portal_token / portal_token_expires_at (the old plaintext design) never
// existed in this database at all (confirmed live, no migration ever created them) — the OTP login
// flow was non-functional in production before this fix, not merely insecure.
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'

const OTP_TTL_MS = 30 * 60 * 1000 // 30 min (was an unenforced 24h in the old design — L-04)
const SESSION_TTL_MS = 4 * 60 * 60 * 1000 // 4h

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Generates a 6-digit CSPRNG OTP, stores its hash + expiry, returns the raw code to email/SMS. */
export async function issueOtp(staffMemberId: string): Promise<string> {
  const code = String(randomInt(100000, 1000000))
  await supabaseAdmin.from('staff_members').update({
    portal_otp_hash: sha256(code),
    portal_otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  }).eq('id', staffMemberId)
  return code
}

/**
 * Verifies a submitted OTP against the stored hash (timing-safe, expiry-checked), and on success
 * issues a new session token: stores its hash in staff_portal_sessions, clears the (single-use) OTP
 * hash, and returns the RAW session token — this is what the client stores and sends as
 * x-portal-token from then on, never the OTP itself.
 */
export async function verifyOtpAndCreateSession(
  staffMemberId: string, businessId: string, submittedCode: string,
): Promise<string | null> {
  const { data: member } = await supabaseAdmin
    .from('staff_members')
    .select('portal_otp_hash, portal_otp_expires_at')
    .eq('id', staffMemberId)
    .maybeSingle()
  if (!member?.portal_otp_hash) return null

  const expected = Buffer.from(member.portal_otp_hash as string)
  const actual = Buffer.from(sha256(submittedCode))
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  if (member.portal_otp_expires_at && new Date(member.portal_otp_expires_at as string) < new Date()) return null

  const sessionToken = randomBytes(32).toString('hex')
  await supabaseAdmin.from('staff_portal_sessions').insert({
    staff_member_id: staffMemberId,
    business_id: businessId,
    token_hash: sha256(sessionToken),
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  })
  // Single-use — clear the OTP hash so it can never be replayed.
  await supabaseAdmin.from('staff_members').update({ portal_otp_hash: null, portal_otp_expires_at: null }).eq('id', staffMemberId)

  return sessionToken
}

export interface PortalIdentity { staff_member_id: string; business_id: string }

/** Reads x-portal-token, hashes it, and resolves the still-valid (unexpired, unrevoked) session. */
export async function resolvePortalSession(req: Request): Promise<PortalIdentity | null> {
  const token = req.headers.get('x-portal-token')?.trim()
  if (!token) return null
  const tokenHash = sha256(token)

  const { data: session } = await supabaseAdmin
    .from('staff_portal_sessions')
    .select('staff_member_id, business_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (!session) return null
  if (session.revoked_at) return null
  if (new Date(session.expires_at as string) < new Date()) return null

  // Confirm the staff member is still active — a deactivated staff member's existing session
  // must stop working immediately, not just at natural expiry.
  const { data: member } = await supabaseAdmin
    .from('staff_members')
    .select('id')
    .eq('id', session.staff_member_id as string)
    .eq('status', 'active')
    .maybeSingle()
  if (!member) return null

  return { staff_member_id: String(session.staff_member_id), business_id: String(session.business_id) }
}
