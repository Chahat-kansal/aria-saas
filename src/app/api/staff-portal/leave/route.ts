export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function resolveToken(req: Request): Promise<{ staff_member_id: string; business_id: string } | null> {
  const token = req.headers.get('x-portal-token')?.trim()
  if (!token) return null
  const { data } = await supabaseAdmin.from('staff_members')
    .select('id, business_id, portal_token_expires_at')
    .eq('portal_token', token).eq('status', 'active').maybeSingle()
  if (!data) return null
  if (data.portal_token_expires_at && new Date(data.portal_token_expires_at as string) < new Date()) return null
  return { staff_member_id: String(data.id), business_id: String(data.business_id) }
}

async function _GET(req: Request) {
  const identity = await resolveToken(req)
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = new Date().getFullYear()
  const [leaveReq, balancesReq] = await Promise.all([
    supabaseAdmin.from('staff_leave')
      .select('id, leave_type, start_date, end_date, days_taken, status, notes, created_at')
      .eq('staff_id', identity.staff_member_id)
      .order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('staff_leave_balances')
      .select('leave_type, opening_balance_days, accrued_days, taken_days, adjusted_days')
      .eq('staff_member_id', identity.staff_member_id).eq('year', year),
  ])

  const balances = (balancesReq.data ?? []).map((b: Record<string, unknown>) => {
    const accrued = (Number(b.opening_balance_days) || 0) + (Number(b.accrued_days) || 0) + (Number(b.adjusted_days) || 0)
    const taken = Number(b.taken_days) || 0
    return { leave_type: String(b.leave_type), accrued_days: +accrued.toFixed(1), taken_days: +taken.toFixed(1), remaining_days: +Math.max(0, accrued - taken).toFixed(1) }
  })

  return NextResponse.json({ leave: leaveReq.data ?? [], balances })
}

async function _POST(req: Request) {
  const identity = await resolveToken(req)
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { leave_type, start_date, end_date, notes } = body
  if (!start_date || !end_date) return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 })

  const daysTaken = Math.max(1, Math.round((new Date(end_date).getTime() - new Date(start_date).getTime()) / 86400000) + 1)

  const { data, error } = await supabaseAdmin.from('staff_leave').insert({
    business_id: identity.business_id,
    staff_id: identity.staff_member_id,
    leave_type: String(leave_type ?? 'annual'),
    start_date: String(start_date),
    end_date: String(end_date),
    days_taken: daysTaken,
    notes: notes ? String(notes).slice(0, 500) : null,
    status: 'pending',
  }).select('id, leave_type, start_date, end_date, days_taken, status').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leave: data }, { status: 201 })
}

export const GET = withErrorCapture('staff-portal/leave', _GET)
export const POST = withErrorCapture('staff-portal/leave', _POST)
