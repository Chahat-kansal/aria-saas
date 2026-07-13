export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getWeekTimesheets, computeHours } from '@/lib/staff/timesheets'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ timesheets: [], totalHours: 0, totalPayCents: 0, activeCount: 0 })

  const url = new URL(req.url)
  const weekStart = url.searchParams.get('week_start') ?? new Date().toISOString().slice(0, 10)
  const timesheets = await getWeekTimesheets(bid, weekStart)
  const totalHours = timesheets.reduce((s, t) => s + t.hours_worked, 0)
  const totalPayCents = timesheets.reduce((s, t) => s + (t.total_pay_cents ?? 0), 0)
  const activeCount = timesheets.filter(t => !t.clock_out).length

  return NextResponse.json({ timesheets, totalHours: +totalHours.toFixed(2), totalPayCents, activeCount })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    staff_member_id?: string; clock_in?: string; clock_out?: string; break_minutes?: number; notes?: string
  }
  if (!body.clock_in) return NextResponse.json({ error: 'clock_in required' }, { status: 400 })

  let staffName = 'Manual entry'
  let payRateCents = 0

  if (body.staff_member_id) {
    const { data: sm } = await supabase.from('staff_members')
      .select('first_name,last_name,pay_rate_cents').eq('id', body.staff_member_id).eq('business_id', bid).maybeSingle()
    if (sm) {
      staffName = `${sm.first_name} ${sm.last_name}`
      payRateCents = Number(sm.pay_rate_cents) || 0
    }
  }

  const breakMins = Number(body.break_minutes) || 0
  const breakType = (body as any).break_type === 'paid' ? 'paid' : 'unpaid'
  const paidBreakMins = breakType === 'paid' ? 0 : breakMins
  const hours = body.clock_out ? computeHours(body.clock_in, body.clock_out, paidBreakMins) : 0
  const regularHours = Math.min(hours, 8)
  const overtimeHours = Math.max(0, hours - 8)
  const regularPay = Math.round(regularHours * payRateCents)
  const overtimePay = Math.round(overtimeHours * payRateCents * 1.5)
  const totalPayCents = regularPay + overtimePay

  const { data, error } = await supabaseAdmin.from('pos_timesheets').insert({
    business_id: bid,
    staff_member_id: body.staff_member_id ?? null,
    staff_name: staffName,
    clock_in: body.clock_in,
    clock_out: body.clock_out ?? null,
    break_minutes: breakMins,
    break_type: breakType,
    hours_worked: +hours.toFixed(2),
    pay_rate_cents: payRateCents,
    total_pay_cents: totalPayCents,
    is_overtime: overtimeHours > 0,
    overtime_cents: overtimePay,
    notes: (body as any).notes ?? null,
    status: body.clock_out ? 'pending' : 'active',
    updated_at: new Date().toISOString(),
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ timesheet: data }, { status: 201 })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('pos_timesheets').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('staff/timesheets', _GET)
export const POST = withErrorCapture('staff/timesheets', _POST)
export const DELETE = withErrorCapture('staff/timesheets', _DELETE)
