export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'

// Normalise common AU mobile formats to E.164. Other formats stored as-is.
function normPhoneSimple(raw: string): string {
  const digits = raw.replace(/[\s\-\.]/g, '')
  if (/^04\d{8}$/.test(digits)) return '+61' + digits.slice(1)
  if (/^\+614\d{8}$/.test(digits)) return digits
  return digits
}

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

  const { data: existing } = await db
    .from('pos_customers')
    .select('id')
    .eq('business_id', realId)
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A customer with this phone number already exists' }, { status: 409 })
  }

  const { data, error } = await db.from('pos_customers').insert({
    business_id: realId,
    name,
    email: email || null,
    phone,
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
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // FIX 3 — LOY-IDENTITY-LINK: find or create a global loyalty_identity so this member
  // is visible to evaluateRewardRules and the cross-business network.
  // db is already service-role (bypasses RLS on loyalty_identity).
  // Best-effort: failure does not block the enrolment response.
  try {
    const identEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : ''
    const identPhone = normPhoneSimple(phone)

    let identityId: string | null = null

    if (identEmail) {
      const { data: byEmail } = await db.from('loyalty_identity').select('id').eq('email', identEmail).maybeSingle()
      if (byEmail?.id) identityId = byEmail.id as string
    }
    if (!identityId && identPhone) {
      const { data: byPhone } = await db.from('loyalty_identity').select('id').eq('phone', identPhone).maybeSingle()
      if (byPhone?.id) identityId = byPhone.id as string
    }
    if (!identityId) {
      const idInsert: Record<string, string> = {}
      if (identEmail) idInsert.email = identEmail
      if (identPhone) idInsert.phone = identPhone
      if (Object.keys(idInsert).length > 0) {
        const { data: created } = await db.from('loyalty_identity').insert(idInsert).select('id').single()
        if (created?.id) identityId = created.id as string
      }
    }
    if (identityId) {
      await db.from('pos_customers').update({ loyalty_identity_id: identityId }).eq('id', data.id)
    }
  } catch {
    // Non-fatal — customer is enrolled, identity link will be established on first loyalty login
  }

  return NextResponse.json({ customer: { id: data.id, name: data.name }, enrolled: true })
}
