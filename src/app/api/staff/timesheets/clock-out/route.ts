export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { clockOut } from '@/lib/staff/timesheets'
import { getBid } from '@/lib/auth/get-bid'
import { pinLookup, verifyStaffPin, upgradeStaffPin } from '@/lib/pos/staff-pin'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { pin?: string; break_minutes?: number }
  const pin = String(body.pin ?? '').trim()
  if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 })

  // SEC-PIN-1 — NOT IN THE BRIEF'S SIX, but this is clock-in's other half on the same table via the
  // same PIN-only flow. Hashing one and leaving the other plaintext would have left a staff member
  // able to clock in through bcrypt and out through a plaintext compare — and would have broken
  // clock-out outright the moment SEC-PIN-2 drops the plaintext column.
  const lookup = pinLookup(bid, pin)
  const baseSelect = () => supabase.from('pos_staff')
    .select('id,name,pin,pin_hash').eq('business_id', bid)

  let staff: Record<string, unknown> | null = null
  if (lookup) {
    const { data } = await baseSelect().eq('pin_lookup', lookup).maybeSingle()
    if (data && await verifyStaffPin(pin, (data as Record<string, unknown>).pin_hash as string)) {
      staff = data as Record<string, unknown>
    }
  }
  if (!staff) {   // LEGACY FALLBACK — remove in SEC-PIN-2
    const { data } = await baseSelect().eq('pin', pin).maybeSingle()
    if (data) {
      staff = data as Record<string, unknown>
      await upgradeStaffPin(supabase, 'pos_staff', String(staff.id), bid, pin)
    }
  }
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
