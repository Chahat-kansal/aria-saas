export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { dollarsToCents, centsToDisplay } from '@/lib/staff/pay-rates'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: member } = await supabaseAdmin.from('staff_members').select('id').eq('id', params.id).eq('business_id', bid).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase.from('staff_pay_rates').select('*').eq('staff_member_id', params.id).order('effective_from', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rates = (data ?? []).map(r => ({ ...r, hourly_rate_dollars: centsToDisplay(Number(r.hourly_rate_cents)) }))
  return NextResponse.json({ rates })
}

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: member } = await supabaseAdmin.from('staff_members').select('id').eq('id', params.id).eq('business_id', bid).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const hourly_rate_cents = body.hourly_rate_dollars ? dollarsToCents(body.hourly_rate_dollars) : Number(body.hourly_rate_cents) || 0
  if (!hourly_rate_cents) return NextResponse.json({ error: 'hourly_rate_dollars or hourly_rate_cents required' }, { status: 400 })

  const { data, error } = await supabase.from('staff_pay_rates').insert({
    business_id: bid,
    staff_member_id: params.id,
    rate_type: body.rate_type ?? 'default',
    hourly_rate_cents,
    applies_to_days: body.applies_to_days ?? null,
    applies_from_time: body.applies_from_time ?? null,
    applies_until_time: body.applies_until_time ?? null,
    effective_from: body.effective_from ?? new Date().toISOString().slice(0, 10),
    effective_until: body.effective_until ?? null,
    notes: body.notes ?? null,
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rate: { ...data, hourly_rate_dollars: centsToDisplay(Number(data.hourly_rate_cents)) } }, { status: 201 })
}

export const GET = withErrorCapture('staff/members/[id]/pay-rates', _GET)
export const POST = withErrorCapture('staff/members/[id]/pay-rates', _POST)
