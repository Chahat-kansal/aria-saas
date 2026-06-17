export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'

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
  return NextResponse.json({ customer: { id: data.id, name: data.name }, enrolled: true })
}
