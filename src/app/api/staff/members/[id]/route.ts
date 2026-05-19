export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { dollarsToCents } from '@/lib/staff/pay-rates'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch the member directly by ID using admin client (no RLS interference)
  const { data, error } = await supabaseAdmin.from('staff_members')
    .select('*, staff_member_skills(skill_id, certified_at, staff_skills(id, name, color)), staff_pay_rates(*), staff_documents(*), staff_leave(id, leave_type, start_date, end_date, days_taken, status)')
    .eq('id', params.id)
    .maybeSingle()

  console.log('[staff/GET] id:', params.id, 'data:', JSON.stringify(data), 'error:', JSON.stringify(error))
  if (!data || error) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify the member belongs to a business owned by this user
  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('id')
    .eq('id', data.business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ member: data })
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: existing } = await supabase.from('staff_members').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const textFields = ['first_name','last_name','preferred_name','position','employment_type','status','personal_email','work_email','mobile','color','pay_type','pay_frequency','visa_type','visa_subclass','notes','emergency_contact_name','emergency_contact_phone','emergency_contact_relationship','bank_account_name','bank_bsb','bank_account_number','tax_file_number']
  for (const f of textFields) {
    if (f in body) update[f] = body[f] === '' ? null : body[f]
  }
  for (const f of ['portal_enabled','right_to_work_verified']) {
    if (typeof body[f] === 'boolean') update[f] = body[f]
  }
  if (body.pay_rate_dollars !== undefined) {
    update.pay_rate_cents = dollarsToCents(body.pay_rate_dollars)
  } else if (body.pay_rate_cents !== undefined) {
    update.pay_rate_cents = Number(body.pay_rate_cents) || null
  }
  if (body.superannuation_rate !== undefined) update.superannuation_rate = Number(body.superannuation_rate) || 11.5
  for (const f of ['start_date','end_date','date_of_birth','right_to_work_verified_date','visa_expiry_date','passport_expiry_date']) {
    if (f in body) update[f] = body[f] ?? null
  }

  const { data, error } = await supabase.from('staff_members').update(update).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: existing } = await supabase.from('staff_members').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('staff_members')
    .update({ status: 'terminated', end_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('staff/members/[id]', _GET)
export const PATCH = withErrorCapture('staff/members/[id]', _PATCH)
export const DELETE = withErrorCapture('staff/members/[id]', _DELETE)
