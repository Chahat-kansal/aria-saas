export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { dollarsToCents } from '@/lib/staff/pay-rates'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ members: [] })

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'active'
  const search = url.searchParams.get('q') ?? ''

  let q = supabase.from('staff_members')
    .select('id, first_name, last_name, preferred_name, position, employment_type, status, personal_email, work_email, mobile, color, portal_enabled, invite_sent_at, user_id, pay_type, pay_rate_cents, start_date, visa_expiry_date, created_at')
    .eq('business_id', bid)
    .order('first_name', { ascending: true })

  if (status !== 'all') q = q.eq('status', status)
  if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,position.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const first_name = String(body.first_name ?? '').trim()
  const last_name = String(body.last_name ?? '').trim()
  const position = String(body.position ?? '').trim()
  if (!first_name || !last_name || !position) {
    return NextResponse.json({ error: 'first_name, last_name, and position required' }, { status: 400 })
  }

  const { data, error } = await supabase.from('staff_members').insert({
    business_id: bid,
    first_name, last_name,
    preferred_name: body.preferred_name ?? null,
    position,
    employment_type: body.employment_type ?? 'casual',
    status: 'active',
    personal_email: body.personal_email ?? null,
    work_email: body.work_email ?? null,
    mobile: body.mobile ?? null,
    emergency_contact_name: body.emergency_contact_name ?? null,
    emergency_contact_phone: body.emergency_contact_phone ?? null,
    emergency_contact_relationship: body.emergency_contact_relationship ?? null,
    pay_type: body.pay_type ?? 'hourly',
    pay_rate_cents: body.pay_rate_dollars ? dollarsToCents(body.pay_rate_dollars) : (Number(body.pay_rate_cents) || null),
    pay_frequency: body.pay_frequency ?? 'fortnightly',
    superannuation_rate: Number(body.superannuation_rate) || 11.5,
    start_date: body.start_date ?? null,
    color: body.color ?? '#6366f1',
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data }, { status: 201 })
}

export const GET = withErrorCapture('staff/members', _GET)
export const POST = withErrorCapture('staff/members', _POST)
