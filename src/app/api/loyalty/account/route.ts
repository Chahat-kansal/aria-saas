export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'
import { encryptCustomerPII, decryptCustomerPII } from '@/lib/aria/customer-pii'

// LOY-NETWORK — customer self-service: edit OWN per-business membership details + granular consent.
// SCOPE: business_id selects the membership; the row is resolved by (identity, business_id) — no IDOR,
// no cross-identity access. Whitelist blocks mass-assignment; name/phone dual-written (plaintext+_enc).
// Email is the GLOBAL identity login email — shown read-only here (not editable per-membership).

// GET ?business_id — prefill the form for the signed-in member at that business.
export async function GET(req: Request) {
  const bidParam = new URL(req.url).searchParams.get('business_id')
  const realId = bidParam ? await resolveBusinessId(supabaseAdmin, bidParam) : null
  if (!realId) return NextResponse.json({ account: null })
  const me = await getLoyaltyMembership(realId)
  if (!me) return NextResponse.json({ account: null })
  const { data } = await supabaseAdmin.from('pos_customers')
    .select('name, name_enc, phone, phone_enc, birthday, marketing_consent, email_consent, sms_consent')
    .eq('id', me.customer_id).maybeSingle()
  if (!data) return NextResponse.json({ account: null })
  // Prefer ciphertext, fall back to plaintext (migration-safe).
  const pii = decryptCustomerPII(data as Record<string, unknown>, me.business_id)
  return NextResponse.json({
    account: {
      name: pii.name ?? '',
      email: me.email,
      phone: pii.phone ?? '',
      birthday: (data.birthday as string | null) ?? '',
      marketing_consent: !!data.marketing_consent,
      email_consent: !!data.email_consent,
      sms_consent: !!data.sms_consent,
    },
  })
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const realId = body.business_id ? await resolveBusinessId(supabaseAdmin, String(body.business_id)) : null
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const me = await getLoyaltyMembership(realId)
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { customer_id, business_id } = me

  const patch: Record<string, unknown> = {}
  const errors: Record<string, string> = {}

  // name — NOT NULL: if provided it must be non-empty.
  if ('name' in body) {
    const name = String(body.name ?? '').trim()
    if (!name) errors.name = 'Name is required.'
    else patch.name = name.slice(0, 80)
  }
  // email is the global identity login — not editable per-membership (ignored if sent).
  // phone — optional; normalise to digits/+, require a plausible length, else clear.
  if ('phone' in body) {
    const raw = String(body.phone ?? '').trim()
    if (raw) {
      const norm = raw.replace(/[^\d+]/g, '')
      if (norm.replace(/\D/g, '').length < 6) errors.phone = 'Enter a valid phone number.'
      else patch.phone = norm
    } else patch.phone = null
  }
  // birthday — optional; must be a valid past date (YYYY-MM-DD), else clear.
  if ('birthday' in body) {
    const b = String(body.birthday ?? '').trim()
    if (b) {
      const d = new Date(b)
      if (isNaN(d.getTime()) || d.getTime() > Date.now()) errors.birthday = 'Enter a valid past date.'
      else patch.birthday = b
    } else patch.birthday = null
  }

  // Granular consent toggles — kept as three independent flags.
  const consentPatch: Record<string, unknown> = {}
  let consentChanged = false
  for (const k of ['marketing_consent', 'email_consent', 'sms_consent'] as const) {
    if (k in body) { consentPatch[k] = !!body[k]; consentChanged = true }
  }

  if (Object.keys(errors).length > 0) return NextResponse.json({ errors }, { status: 400 })
  if (Object.keys(patch).length === 0 && !consentChanged) {
    return NextResponse.json({ error: 'No changes to save.' }, { status: 400 })
  }

  // PII dual-write — emit *_enc for exactly the name/email/phone fields being changed.
  const piiSrc: Record<string, string | null> = {}
  if ('name' in patch) piiSrc.name = patch.name as string
  if ('email' in patch) piiSrc.email = patch.email as string | null
  if ('phone' in patch) piiSrc.phone = patch.phone as string | null
  const piiEnc = encryptCustomerPII(piiSrc, business_id)

  const finalPatch: Record<string, unknown> = { ...patch, ...piiEnc, ...consentPatch, updated_at: new Date().toISOString() }
  if (consentChanged) {
    finalPatch.consent_captured_at = new Date().toISOString()
    finalPatch.consent_source = 'loyalty_self_service'
  }

  // Scoped to the session's own row + business — never a request-supplied id.
  const { error } = await supabaseAdmin.from('pos_customers')
    .update(finalPatch).eq('id', customer_id).eq('business_id', business_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
