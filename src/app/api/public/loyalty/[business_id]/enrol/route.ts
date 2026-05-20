export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function POST(req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const body = await req.json()
  const { name, email, phone, birthday } = body

  if (!name || !phone) {
    return NextResponse.json({ error: 'Name and phone required' }, { status: 400 })
  }

  const { data: config } = await db
    .from('pos_loyalty_config')
    .select('public_enrol_enabled')
    .eq('business_id', business_id)
    .maybeSingle()

  if (!config?.public_enrol_enabled) {
    return NextResponse.json({ error: 'Enrolment not available' }, { status: 404 })
  }

  const { data: existing } = await db
    .from('pos_customers')
    .select('id')
    .eq('business_id', business_id)
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A customer with this phone number already exists' }, { status: 409 })
  }

  const { data, error } = await db.from('pos_customers').insert({
    business_id,
    name,
    email: email || null,
    phone,
    birthday: birthday || null,
    marketing_consent: true,
    source: 'loyalty_enrol',
    points_balance: 0,
    stamps_count: 0,
    loyalty_points: 0,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customer: { id: data.id, name: data.name }, enrolled: true })
}
