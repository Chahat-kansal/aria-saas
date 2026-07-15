import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveHourlyRateCents } from './pay-rates'
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action'

export interface TimesheetEntry {
  id: string
  business_id: string
  staff_id: string | null
  staff_member_id: string | null
  staff_name: string
  outlet_id: string | null
  shift_id: string | null
  clock_in: string
  clock_out: string | null
  break_minutes: number
  pay_rate_cents: number | null
  total_pay_cents: number | null
  hours_worked: number
  status: 'active' | 'pending' | 'approved'
  approved: boolean
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
}

export interface LabourReportRow {
  staff_member_id: string
  staff_name: string
  position: string
  employment_type: string
  total_hours: number
  total_pay_cents: number
  shift_count: number
  approved_count: number
  pending_count: number
}

export function computeHours(clockIn: string, clockOut: string, breakMinutes: number): number {
  const diffMs = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  const totalMinutes = diffMs / 60_000 - (Number(breakMinutes) || 0)
  return Math.max(0, +(totalMinutes / 60).toFixed(2))
}

// CANOPY-STAFF-CLOCK-1 — factored out of clockIn()'s own double-clock-in guard so Canopy's PIN
// route can check clock status WITHOUT mutating anything (never silently clock someone in just to
// find out whether they already are). Behavior-identical to the inline check this replaces.
export async function getActiveClockIn(
  businessId: string,
  posStaffId: string,
): Promise<{ id: string; clock_in: string } | null> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase.from('pos_timesheets')
    .select('id,clock_in').eq('business_id', businessId).eq('staff_id', posStaffId).is('clock_out', null).maybeSingle()
  return (data as { id: string; clock_in: string } | null) ?? null
}

export async function clockIn(
  businessId: string,
  posStaffId: string,
  outletId: string | null,
): Promise<{ timesheet_id: string; staff_name: string; clock_in: string } | null> {
  const supabase = createServerSupabaseClient()

  const { data: posStaff } = await supabase.from('pos_staff')
    .select('id,name,business_id').eq('id', posStaffId).eq('business_id', businessId).maybeSingle()
  if (!posStaff) return null

  // Prevent double clock-in
  const existing = await getActiveClockIn(businessId, posStaffId)
  if (existing) return null

  const { data: member } = await supabase.from('staff_members')
    .select('id,pay_rate_cents').eq('business_id', businessId).eq('pos_staff_id', posStaffId).maybeSingle()

  const now = new Date()
  const rateCents = member
    ? await resolveHourlyRateCents(businessId, String(member.id), now, now.toTimeString().slice(0, 5))
    : 0

  const clockInTime = now.toISOString()

  const { data: ts } = await supabase.from('pos_timesheets').insert({
    business_id: businessId,
    staff_id: posStaffId,
    staff_member_id: (member as { id: string } | null)?.id ?? null,
    staff_name: String(posStaff.name),
    outlet_id: outletId,
    clock_in: clockInTime,
    pay_rate_cents: rateCents,
    status: 'active',
    break_minutes: 0,
    updated_at: clockInTime,
  }).select('id,clock_in').single()

  if (!ts) return null

  void (async () => {
    try {
      await supabaseAdmin.from('aria_actions').insert({
        business_id: businessId,
        category: 'staff',
        title: `${posStaff.name} clocked in`,
        recommendation: `${posStaff.name} clocked in at ${clockInTime.slice(11, 16)}.`,
        expected_impact: '0.00',
        confidence: 'high',
        status: 'completed',
        source: 'timesheets:clock_in',
        priority: 'low',
        payload: { timesheet_id: (ts as { id: string }).id, staff_name: posStaff.name, outlet_id: outletId, clock_in: clockInTime },
      })
    } catch (e) { console.error('[non-fatal]', e) }
  })()

  return { timesheet_id: (ts as { id: string }).id, staff_name: String(posStaff.name), clock_in: clockInTime }
}

export async function clockOut(
  businessId: string,
  posStaffId: string,
  breakMinutes = 0,
): Promise<{ timesheet_id: string; hours_worked: number; total_pay_cents: number } | null> {
  const supabase = createServerSupabaseClient()

  const { data: ts } = await supabase.from('pos_timesheets')
    .select('id,clock_in,pay_rate_cents,staff_member_id,staff_name')
    .eq('business_id', businessId).eq('staff_id', posStaffId).is('clock_out', null).maybeSingle()
  if (!ts) return null

  const clockOutTime = new Date().toISOString()
  const hours = computeHours(String(ts.clock_in), clockOutTime, breakMinutes)
  const rateCents = Number(ts.pay_rate_cents) || 0
  const totalPayCents = Math.round(hours * rateCents)

  await supabase.from('pos_timesheets').update({
    clock_out: clockOutTime,
    break_minutes: breakMinutes,
    total_pay_cents: totalPayCents,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }).eq('id', String((ts as { id: string }).id))

  // Variance check against scheduled shift
  if (ts.staff_member_id) {
    void (async () => {
      try {
        const shiftDayStart = new Date(String(ts.clock_in)); shiftDayStart.setHours(0, 0, 0, 0)
        const shiftDayEnd = new Date(shiftDayStart); shiftDayEnd.setDate(shiftDayEnd.getDate() + 1)
        const { data: shift } = await supabase.from('staff_shifts')
          .select('start_time,end_time,break_minutes')
          .eq('staff_member_id', String(ts.staff_member_id))
          .gte('start_time', shiftDayStart.toISOString())
          .lt('start_time', shiftDayEnd.toISOString())
          .maybeSingle()

        if (shift?.end_time) {
          const scheduledHours = computeHours(String(shift.start_time), String(shift.end_time), Number(shift.break_minutes) || 0)
          const variance = Math.abs(hours - scheduledHours) / Math.max(scheduledHours, 0.1)
          if (variance > 0.15) {
            await upsertAriaAction({
              business_id: businessId,
              category: 'staff',
              title: `Timesheet variance: ${String(ts.staff_name)}`,
              recommendation: `${String(ts.staff_name)} worked ${hours.toFixed(1)}h vs ${scheduledHours.toFixed(1)}h scheduled (${(variance * 100).toFixed(0)}% variance).`,
              expected_impact: (Math.abs(hours - scheduledHours) * rateCents / 100).toFixed(2),
              confidence: 'high',
              status: 'pending',
              source: 'timesheets:variance',
              priority: variance > 0.30 ? 'high' : 'medium',
              payload: { timesheet_id: String((ts as { id: string }).id), actual_hours: hours, scheduled_hours: scheduledHours, variance_pct: +(variance * 100).toFixed(1) },
            })
          }
        }
      } catch (e) { console.error('[non-fatal]', e) }
    })()
  }

  return { timesheet_id: String((ts as { id: string }).id), hours_worked: hours, total_pay_cents: totalPayCents }
}

export async function getWeekTimesheets(businessId: string, weekStart: string): Promise<TimesheetEntry[]> {
  const supabase = createServerSupabaseClient()
  const weekEnd = new Date(weekStart + 'T00:00:00')
  weekEnd.setDate(weekEnd.getDate() + 7)

  const { data } = await supabase.from('pos_timesheets')
    .select('*').eq('business_id', businessId)
    .gte('clock_in', weekStart + 'T00:00:00')
    .lt('clock_in', weekEnd.toISOString())
    .order('clock_in', { ascending: false })

  return (data ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    hours_worked: t.clock_out ? computeHours(String(t.clock_in), String(t.clock_out), Number(t.break_minutes) || 0) : 0,
    status: (t.status ?? 'pending') as 'active' | 'pending' | 'approved',
    break_minutes: Number(t.break_minutes) || 0,
    pay_rate_cents: t.pay_rate_cents != null ? Number(t.pay_rate_cents) : null,
    total_pay_cents: t.total_pay_cents != null ? Number(t.total_pay_cents) : null,
    approved: Boolean(t.approved),
  })) as TimesheetEntry[]
}

export async function buildLabourReport(businessId: string, fromDate: string, toDate: string): Promise<LabourReportRow[]> {
  const supabase = createServerSupabaseClient()

  const [timesheetsQ, membersQ] = await Promise.all([
    supabase.from('pos_timesheets')
      .select('staff_member_id,staff_name,clock_in,clock_out,break_minutes,total_pay_cents,approved')
      .eq('business_id', businessId).gte('clock_in', fromDate).lte('clock_in', toDate)
      .not('clock_out', 'is', null),
    supabase.from('staff_members')
      .select('id,first_name,last_name,position,employment_type').eq('business_id', businessId).eq('status', 'active'),
  ])

  const memberMap = new Map((membersQ.data ?? []).map((m: Record<string,unknown>) => [String(m.id), m]))
  const byMember = new Map<string, LabourReportRow>()

  for (const t of timesheetsQ.data ?? []) {
    const memberId = String(t.staff_member_id ?? 'unknown')
    const member = memberMap.get(memberId) as Record<string,string> | undefined
    const name = member ? `${member.first_name} ${member.last_name}` : String(t.staff_name ?? 'Unknown')

    if (!byMember.has(memberId)) {
      byMember.set(memberId, {
        staff_member_id: memberId,
        staff_name: name,
        position: String(member?.position ?? ''),
        employment_type: String(member?.employment_type ?? ''),
        total_hours: 0, total_pay_cents: 0, shift_count: 0, approved_count: 0, pending_count: 0,
      })
    }
    const row = byMember.get(memberId)!
    const hours = t.clock_out ? computeHours(String(t.clock_in), String(t.clock_out), Number(t.break_minutes) || 0) : 0
    row.total_hours += hours
    row.total_pay_cents += Number(t.total_pay_cents) || 0
    row.shift_count++
    if (t.approved) row.approved_count++; else row.pending_count++
  }

  return [...byMember.values()].sort((a, b) => b.total_pay_cents - a.total_pay_cents)
}
