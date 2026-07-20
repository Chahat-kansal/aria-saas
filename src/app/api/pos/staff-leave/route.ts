export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ leave: [] })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let q = supabaseAdmin
    .from('staff_leave')
    .select('id, staff_id, staff_name, leave_type, start_date, end_date, notes, status, created_at')
    .eq('business_id', bid)
    .order('start_date', { ascending: false })
    .limit(100)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leave: data ?? [] })
}

async function _POST(req: Request, _ctx: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json()
  const { staff_id, staff_name, leave_type, start_date, end_date, notes } = body
  if (!leave_type || !start_date || !end_date) {
    return NextResponse.json({ error: 'leave_type, start_date, end_date required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('staff_leave').insert({
    business_id: bid,
    staff_id: staff_id ?? null,
    staff_name: staff_name ?? null,
    leave_type,
    start_date,
    end_date,
    notes: notes ?? null,
    status: 'pending',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leave: data })
}

async function _PATCH(req: Request, _ctx: unknown, { businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.status) {
    update.status = body.status
    if (body.status === 'approved') update.approved_at = new Date().toISOString()
  }
  if (body.notes !== undefined) update.notes = body.notes

  const { error } = await supabaseAdmin.from('staff_leave').update(update).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/staff-leave', _GET)
export const POST = withBusinessContext('pos/staff-leave', _POST)
export const PATCH = withBusinessContext('pos/staff-leave', _PATCH)
