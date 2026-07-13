export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { clockOut } from '@/lib/staff/timesheets'
import { getBid } from '@/lib/auth/get-bid'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { pin?: string; break_minutes?: number }
  const pin = String(body.pin ?? '').trim()
  if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 })

  const { data: staff } = await supabase.from('pos_staff')
    .select('id,name').eq('business_id', bid).eq('pin', pin).maybeSingle()
  if (!staff) return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })

  const result = await clockOut(bid, String(staff.id), Number(body.break_minutes) || 0)
  if (!result) return NextResponse.json({ error: 'No active clock-in found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    staff_name: staff.name,
    hours_worked: result.hours_worked,
    total_pay_cents: result.total_pay_cents,
    message: `Goodbye ${staff.name}! ${result.hours_worked.toFixed(1)}h logged. Est. pay: $${(result.total_pay_cents / 100).toFixed(2)}.`,
  })
}

export const POST = withErrorCapture('staff/timesheets/clock-out', _POST)
