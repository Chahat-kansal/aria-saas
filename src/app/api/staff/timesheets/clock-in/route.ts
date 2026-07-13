export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { clockIn } from '@/lib/staff/timesheets'
import { getBid } from '@/lib/auth/get-bid'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    pin?: string
    outlet_id?: string
    latitude?: number
    longitude?: number
    accuracy?: number
  }

  const pin = String(body.pin ?? '').trim()
  if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 })

  const { data: staff } = await supabase.from('pos_staff')
    .select('id,name,is_active').eq('business_id', bid).eq('pin', pin).maybeSingle()

  if (!staff) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  if (!staff.is_active) return NextResponse.json({ error: 'Staff account inactive' }, { status: 403 })

  const result = await clockIn(bid, String(staff.id), body.outlet_id ? String(body.outlet_id) : null)
  if (!result) return NextResponse.json({ error: 'Already clocked in' }, { status: 409 })

  // Store GPS if provided
  if (body.latitude != null && body.longitude != null) {
    await supabase.from('pos_timesheets')
      .update({ notes: 'GPS: ' + body.latitude.toFixed(6) + ',' + body.longitude.toFixed(6) + ' (±' + Math.round(body.accuracy ?? 0) + 'm)' })
      .eq('id', result.timesheet_id)
  }

  return NextResponse.json({
    ok: true,
    staff_name: result.staff_name,
    clock_in: result.clock_in,
    timesheet_id: result.timesheet_id,
    gps_recorded: body.latitude != null,
    message: 'Welcome ' + result.staff_name + '! Clocked in at ' + result.clock_in.slice(11, 16) + '.',
  })
}

export const POST = withErrorCapture('staff/timesheets/clock-in', _POST)
