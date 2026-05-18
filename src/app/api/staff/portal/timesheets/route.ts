export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity } from '@/lib/staff/portal'
import { computeHours } from '@/lib/staff/timesheets'

async function _GET(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const weeks = Math.min(Number(url.searchParams.get('weeks')) || 4, 12)
  const since = new Date(Date.now() - weeks * 7 * 86400_000).toISOString()

  const supabase = createServerSupabaseClient()
  const { data } = await supabase.from('pos_timesheets')
    .select('id,clock_in,clock_out,break_minutes,total_pay_cents,status,approved,notes')
    .eq('staff_member_id', identity.staff_member_id)
    .gte('clock_in', since)
    .order('clock_in', { ascending: false })
    .limit(100)

  const timesheets = (data ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    hours_worked: t.clock_out
      ? computeHours(String(t.clock_in), String(t.clock_out), Number(t.break_minutes) || 0)
      : 0,
    pay_estimate: t.total_pay_cents
      ? `$${((Number(t.total_pay_cents) || 0) / 100).toFixed(2)}`
      : null,
  }))

  const totalHours = timesheets.reduce((s: number, t: { hours_worked: number }) => s + t.hours_worked, 0)
  return NextResponse.json({ timesheets, totalHours: +totalHours.toFixed(2) })
}

export const GET = withErrorCapture('staff/portal/timesheets', _GET)
