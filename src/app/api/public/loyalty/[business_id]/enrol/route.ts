export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'
import { requireTurnstile } from '@/lib/security/turnstile'
import { normalisePhone } from '@/lib/clicksend'
import { encryptCustomerPII } from '@/lib/aria/customer-pii'
import { linkLoyaltyIdentity } from '@/lib/loyalty/link-identity'

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function POST(req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params

  // SEC-H1: per-IP throttle on the public self-enrolment endpoint (signup-spam guard).
  const rl = await rateLimit(`enrol:${clientIp(req)}`, 10, 60)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const realId = await resolveBusinessId(db, business_id)
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, email, phone, birthday } = body

  // BOOKINGS-PUBLIC-PROTECT-1 — same anonymous-public-form risk class as bookings/public (no
  // session, no auth); this had rate-limiting but no bot check. Reusing the proven helper, not a
  // second implementation.
  const turnstileDenied = await requireTurnstile(body.turnstile_token as string | undefined, clientIp(req))
  if (turnstileDenied) return turnstileDenied

  if (!name || !phone) {
    return NextResponse.json({ error: 'Name and phone required' }, { status: 400 })
  }

  const { data: config } = await db
    .from('pos_loyalty_config')
    .select('public_enrol_enabled')
    .eq('business_id', realId)
    .maybeSingle()

  if (!config?.public_enrol_enabled) {
    return NextResponse.json({ error: 'Enrolment not available' }, { status: 404 })
  }

  const normPhone = normalisePhone(phone)

  // SEC: per-phone throttle so the same number can't be repeatedly enrolled from different IPs.
  const phoneRl = await rateLimit(`enrol:phone:${normPhone}`, 5, 3600)
  if (!phoneRl.allowed) return tooManyRequests(phoneRl.retryAfter)

  // TCA7-ENROL-ORACLE-FIX — a 409 here used to distinguish "this phone is already a member" from
  // "it isn't", which is an enumeration oracle on its own even with zero identity data in the body
  // (same leak class as WIDGET-PII-LEAK-FIX, weaker form: existence-only, not identity-bearing).
  // Enrol is now idempotent instead: an already-enrolled phone silently skips the write (no
  // duplicate row, no second membership, no overwrite of the real member's stored name/email from
  // an unverified re-submission) and both paths return the exact same success-shaped response.
  const { data: existing } = await db
    .from('pos_customers')
    .select('id')
    .eq('business_id', realId)
    .eq('phone', normPhone)
    .maybeSingle()

  if (!existing) {
    const { data, error } = await db.from('pos_customers').insert({
      business_id: realId,
      name,
      email: email || null,
      phone: normPhone,
      birthday: birthday || null,
      // CONSENT-COLLECTION-1: online self-enrolment is an express opt-in act — stamp provenance.
      marketing_consent: true,
      sms_consent: true,
      email_consent: !!email,
      consent_captured_at: new Date().toISOString(),
      consent_source: 'online',
      source: 'loyalty_enrol',
      points_balance: 0,
      stamps_count: 0,
      loyalty_points: 0,
      // SECURITY-RESIDUE-FIX-1 PART 5 — one of the 3 busiest public customer-intake routes never
      // dual-writing the encrypted PII columns (src/lib/aria/customer-pii.ts).
      ...encryptCustomerPII({ email: email || null, phone: normPhone, name }, realId),
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // FIX 3 — LOY-IDENTITY-LINK: find or create a global loyalty_identity so this member
    // is visible to evaluateRewardRules and the cross-business network.
    // db is already service-role (bypasses RLS on loyalty_identity).
    //
    // ARIA-LOYALTY-FIX-1 §1 — this block used to live here inline. It moved to
    // lib/loyalty/link-identity.ts UNCHANGED IN BEHAVIOUR so the till can call the same code, and
    // so the two paths cannot drift into minting two identities for one person. Still best-effort:
    // the helper never throws, and a failure does not block the enrolment response.
    //
    // ARIA-LOYALTY-CLOSEOUT-1 §1 — the outcome is now READ, but ONLY into the server log.
    //
    // THE RESPONSE MUST NOT MOVE. TCA7-ENROL-ORACLE-FIX made both branches byte-identical on
    // purpose: any observable difference between "already a member" and "not a member" is an
    // enumeration oracle on a public, unauthenticated route. identity_taken is precisely the signal
    // an attacker wants — it means this phone/email already belongs to someone here — so it is
    // logged for the owner and never surfaced to the caller. Do not add it to the response body,
    // the status code, or a header.
    const link = await linkLoyaltyIdentity(db, { customerId: data.id as string, email, phone: normPhone })
    if (link.reason === 'identity_taken') {
      console.warn('[loyalty/enrol] identity already held by a live customer', {
        businessId: realId, identityId: link.identityId, heldBy: link.heldByCustomerId,
      })
    } else if (link.reason === 'failed') {
      console.warn('[loyalty/enrol] loyalty identity link failed (non-fatal)', { businessId: realId })
    }
  }

  // Log every attempt (new + already-enrolled) for the owner's own audit trail — never surfaced
  // to the public caller, so it adds no observable difference between the two branches.
  void db.from('activity_log').insert({
    business_id: realId,
    action_type: 'loyalty_enrol_attempt',
    description: '[loyalty/enrol] public self-enrolment attempt',
    metadata: { phone: normPhone, email: email || null, was_existing: !!existing },
    created_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) console.error('[non-fatal] activity_log insert failed', error) })

  // Byte-identical response regardless of whether this phone was already a member — `name` is
  // echoed straight from the caller's own submission, never sourced from the DB row, so a guessed
  // phone number that happens to match a real member never surfaces that member's real stored name.
  return NextResponse.json({ enrolled: true, name })
}
