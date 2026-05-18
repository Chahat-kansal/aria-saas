export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity, getOwnShifts } from '@/lib/staff/portal'

async function _GET(_req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shifts = await getOwnShifts(identity.staff_member_id, identity.business_id, 4)
  return NextResponse.json({ shifts })
}

async function _POST(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { week_start?: string; shift_id?: string }
  const weekStart = String(body.week_start ?? '')
  const shiftId = String(body.shift_id ?? '')
  if (!weekStart || !shiftId) {
    return NextResponse.json({ error: 'week_start and shift_id required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data: roster } = await supabase.from('pos_rosters')
    .select('id,shifts').eq('business_id', identity.business_id)
    .eq('week_start', weekStart).maybeSingle()

  if (!roster) return NextResponse.json({ error: 'Roster not found' }, { status: 404 })

  const shifts = Array.isArray(roster.shifts) ? roster.shifts : []
  let updated = false
  const newShifts = shifts.map((s: Record<string, unknown>) => {
    if (String(s.id) === shiftId && String(s.staff_member_id) === identity.staff_member_id) {
      updated = true
      return { ...s, confirmed_by_staff: true }
    }
    return s
  })

  if (!updated) return NextResponse.json({ error: 'Shift not found or not yours' }, { status: 404 })

  await supabase.from('pos_rosters').update({ shifts: newShifts }).eq('id', String((roster as { id: string }).id))
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('staff/portal/schedule', _GET)
export const POST = withErrorCapture('staff/portal/schedule', _POST)
