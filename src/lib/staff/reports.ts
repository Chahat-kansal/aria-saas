import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildLabourReport } from './timesheets'
import { REPORTABLE_STATUSES } from '@/lib/pos/revenue'

export interface AttendanceRow {
  staff_member_id: string
  staff_name: string
  position: string
  shifts_scheduled: number
  shifts_worked: number
  attendance_rate: number
  late_clockins: number
  avg_variance_minutes: number
  total_hours_worked: number
  total_hours_rostered: number
}

export async function buildAttendanceReport(
  businessId: string,
  fromDate: string,
  toDate: string,
): Promise<AttendanceRow[]> {
  const supabase = createServerSupabaseClient()

  const [timesheetsQ, shiftsQ, membersQ] = await Promise.all([
    supabase.from('pos_timesheets')
      .select('staff_member_id,staff_name,clock_in,clock_out,break_minutes')
      .eq('business_id', businessId)
      .gte('clock_in', fromDate + 'T00:00:00')
      .lte('clock_in', toDate + 'T23:59:59')
      .not('clock_out', 'is', null),
    supabase.from('staff_shifts')
      .select('staff_member_id,start_time,end_time,break_minutes')
      .eq('business_id', businessId)
      .gte('start_time', fromDate + 'T00:00:00')
      .lte('start_time', toDate + 'T23:59:59'),
    supabase.from('staff_members')
      .select('id,first_name,last_name,position')
      .eq('business_id', businessId).eq('status', 'active'),
  ])

  const memberMap = new Map((membersQ.data ?? []).map((m: Record<string,unknown>) => [String(m.id), m]))
  const byStaff = new Map<string, AttendanceRow>()

  const initRow = (id: string): AttendanceRow => {
    const m = memberMap.get(id) as Record<string,unknown> | undefined
    return {
      staff_member_id: id,
      staff_name: m ? `${m.first_name} ${m.last_name}` : 'Unknown',
      position: String(m?.position ?? ''),
      shifts_scheduled: 0, shifts_worked: 0, attendance_rate: 0,
      late_clockins: 0, avg_variance_minutes: 0,
      total_hours_worked: 0, total_hours_rostered: 0,
    }
  }

  // Scheduled shifts
  const shiftsByStaffDay = new Map<string, { start: Date }>()
  for (const s of shiftsQ.data ?? []) {
    const id = String(s.staff_member_id ?? '')
    if (!id) continue
    if (!byStaff.has(id)) byStaff.set(id, initRow(id))
    const row = byStaff.get(id)!
    row.shifts_scheduled++
    if (s.end_time) {
      const h = Math.max(0, (new Date(String(s.end_time)).getTime() - new Date(String(s.start_time)).getTime()) / 3600_000 - (Number(s.break_minutes) || 0) / 60)
      row.total_hours_rostered += h
    }
    const day = String(s.start_time).slice(0, 10)
    shiftsByStaffDay.set(`${id}:${day}`, { start: new Date(String(s.start_time)) })
  }

  // Worked timesheets
  const varianceByStaff = new Map<string, number[]>()
  for (const t of timesheetsQ.data ?? []) {
    const id = String(t.staff_member_id ?? '')
    if (!id) continue
    if (!byStaff.has(id)) byStaff.set(id, initRow(id))
    const row = byStaff.get(id)!
    row.shifts_worked++
    const h = Math.max(0, (new Date(String(t.clock_out)).getTime() - new Date(String(t.clock_in)).getTime()) / 3600_000 - (Number(t.break_minutes) || 0) / 60)
    row.total_hours_worked += h
    const day = String(t.clock_in).slice(0, 10)
    const scheduled = shiftsByStaffDay.get(`${id}:${day}`)
    if (scheduled) {
      const lateMin = (new Date(String(t.clock_in)).getTime() - scheduled.start.getTime()) / 60_000
      if (lateMin > 5) row.late_clockins++
      if (!varianceByStaff.has(id)) varianceByStaff.set(id, [])
      varianceByStaff.get(id)!.push(Math.abs(lateMin))
    }
  }

  for (const [id, row] of byStaff) {
    row.attendance_rate = row.shifts_scheduled > 0
      ? Math.round((row.shifts_worked / row.shifts_scheduled) * 100) : 100
    const varList = varianceByStaff.get(id) ?? []
    row.avg_variance_minutes = varList.length > 0
      ? Math.round(varList.reduce((a, b) => a + b, 0) / varList.length) : 0
    row.total_hours_worked = +row.total_hours_worked.toFixed(2)
    row.total_hours_rostered = +row.total_hours_rostered.toFixed(2)
  }

  return [...byStaff.values()].sort((a, b) => b.total_hours_worked - a.total_hours_worked)
}

export async function sendWeeklyLabourReport(businessId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient()
  const { data: biz } = await supabase.from('businesses')
    .select('name,email').eq('id', businessId).maybeSingle()
  if (!(biz as { email?: string } | null)?.email) return false

  const now = new Date()
  const dow = now.getDay()
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) - 7)
  lastMonday.setHours(0, 0, 0, 0)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  lastSunday.setHours(23, 59, 59, 999)

  const fromDate = lastMonday.toISOString().slice(0, 10)
  const toDate = lastSunday.toISOString().slice(0, 10)

  const labourRows = await buildLabourReport(businessId, fromDate + 'T00:00:00', toDate + 'T23:59:59')
  if (!labourRows.length) return false

  const { data: sales } = await supabase.from('pos_sales')
    .select('total_amount').eq('business_id', businessId).in('status', REPORTABLE_STATUSES)
    .gte('created_at', fromDate + 'T00:00:00').lte('created_at', toDate + 'T23:59:59')
  const weekRevenue = (sales ?? []).reduce((s, x: Record<string,unknown>) => s + (Number(x.total_amount) || 0), 0)
  const totalLabourCents = labourRows.reduce((s, r) => s + r.total_pay_cents, 0)
  const labourPct = weekRevenue > 0 ? ((totalLabourCents / 100) / weekRevenue * 100).toFixed(1) : 'N/A'

  const bizName = String((biz as { name?: string } | null)?.name ?? 'Your Business')
  const bizEmail = String((biz as { email?: string } | null)?.email ?? '')

  const rowsHtml = labourRows.map(r => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${r.staff_name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${r.total_hours.toFixed(1)}h</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${(r.total_pay_cents / 100).toFixed(2)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${r.approved_count}/${r.shift_count}</td>
    </tr>`).join('')

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#2D5240">Weekly Labour Report — ${bizName}</h2>
  <p style="color:#666">Week of ${fromDate} to ${toDate}</p>
  <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:16px 0;display:flex;gap:24px;flex-wrap:wrap">
    <div><div style="font-size:12px;color:#888">Total Labour Cost</div><div style="font-size:22px;font-weight:600;color:#2D5240">$${(totalLabourCents/100).toFixed(2)}</div></div>
    <div><div style="font-size:12px;color:#888">Labour %</div><div style="font-size:22px;font-weight:600">${labourPct}%</div></div>
    <div><div style="font-size:12px;color:#888">Week Revenue</div><div style="font-size:22px;font-weight:600">$${weekRevenue.toFixed(2)}</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead><tr style="background:#f0f0f0">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666">Staff</th>
      <th style="padding:8px 12px;text-align:center;font-size:12px;color:#666">Hours</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#666">Est. Pay</th>
      <th style="padding:8px 12px;text-align:center;font-size:12px;color:#666">Approved</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#aaa">Sent automatically by Aria OS · <a href="https://ariaos.site/dashboard/staff/timesheets">View full timesheets →</a></p>
</div>`

  const apiKey = process.env.RESEND_API_KEY ?? ''
  if (!apiKey) return false
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Aria OS <aria@ariaos.site>', to: [bizEmail], subject: `Weekly Labour Report: ${bizName} — w/c ${fromDate}`, html }),
  })
  return r.ok
}
