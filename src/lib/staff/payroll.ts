import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface PayrollLineItem {
  staff_member_id: string | null
  staff_name: string
  position: string
  employment_type: string
  pay_frequency: string
  hours_worked: number
  hourly_rate_cents: number
  gross_pay_cents: number
  superannuation_rate: number
  super_cents: number
  tax_withheld_cents: number
  net_estimate_cents: number
  timesheet_ids: string[]
}

export async function buildPayrollRun(
  businessId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PayrollLineItem[]> {
  const supabase = createServerSupabaseClient()

  const { data: timesheets } = await supabase.from('pos_timesheets')
    .select('id, staff_member_id, staff_name, clock_in, clock_out, break_minutes, total_pay_cents, pay_rate_cents')
    .eq('business_id', businessId)
    .eq('approved', true)
    .gte('clock_in', periodStart + 'T00:00:00')
    .lte('clock_in', periodEnd + 'T23:59:59')

  const memberIds = [...new Set((timesheets ?? []).map(t => t.staff_member_id).filter(Boolean))] as string[]
  const { data: members } = await supabase.from('staff_members')
    .select('id, first_name, last_name, position, employment_type, pay_frequency, superannuation_rate, pay_rate_cents')
    .in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000'])

  const memberMap = new Map((members ?? []).map(m => [String(m.id), m]))

  const byStaff = new Map<string, {
    timesheet_ids: string[]
    total_pay_cents: number
    hours_worked: number
    pay_rate_cents: number
    staff_name: string
  }>()

  for (const t of timesheets ?? []) {
    const key = String(t.staff_member_id ?? `unknown:${t.staff_name}`)
    if (!byStaff.has(key)) {
      byStaff.set(key, {
        timesheet_ids: [],
        total_pay_cents: 0,
        hours_worked: 0,
        pay_rate_cents: Number(t.pay_rate_cents) || 0,
        staff_name: String(t.staff_name ?? ''),
      })
    }
    const row = byStaff.get(key)!
    row.timesheet_ids.push(String(t.id))
    row.total_pay_cents += Number(t.total_pay_cents) || 0
    if (t.clock_out) {
      const diffMs = new Date(String(t.clock_out)).getTime() - new Date(String(t.clock_in)).getTime()
      const h = Math.max(0, diffMs / 3600_000 - (Number(t.break_minutes) || 0) / 60)
      row.hours_worked += h
    }
  }

  const lines: PayrollLineItem[] = []
  for (const [staffId, agg] of byStaff) {
    const member = memberMap.get(staffId)
    const superRate = Number(member?.superannuation_rate) || 11.5
    const grossCents = Math.round(Number(agg.total_pay_cents) || 0)
    const superCents = Math.round(grossCents * superRate / 100)
    const taxCents = 0
    const netCents = grossCents - taxCents

    lines.push({
      staff_member_id: member ? String(member.id) : null,
      staff_name: member ? `${member.first_name} ${member.last_name}` : agg.staff_name || 'Unknown',
      position: String(member?.position ?? ''),
      employment_type: String(member?.employment_type ?? 'casual'),
      pay_frequency: String(member?.pay_frequency ?? 'fortnightly'),
      hours_worked: +agg.hours_worked.toFixed(2),
      hourly_rate_cents: Number(agg.pay_rate_cents) || 0,
      gross_pay_cents: grossCents,
      superannuation_rate: superRate,
      super_cents: superCents,
      tax_withheld_cents: taxCents,
      net_estimate_cents: netCents,
      timesheet_ids: agg.timesheet_ids,
    })
  }

  return lines.sort((a, b) => b.gross_pay_cents - a.gross_pay_cents)
}

export async function savePayrollRun(
  businessId: string,
  userId: string,
  periodStart: string,
  periodEnd: string,
  lines: PayrollLineItem[],
): Promise<string | null> {
  const totalGross = lines.reduce((s, l) => s + l.gross_pay_cents, 0)
  const totalSuper = lines.reduce((s, l) => s + l.super_cents, 0)
  const totalNet = lines.reduce((s, l) => s + l.net_estimate_cents, 0)

  const { data: run, error } = await supabaseAdmin.from('payroll_runs').insert({
    business_id: businessId,
    period_start: periodStart,
    period_end: periodEnd,
    status: 'draft',
    total_gross_cents: totalGross,
    total_super_cents: totalSuper,
    total_net_estimate_cents: totalNet,
    staff_count: lines.length,
    created_by: userId,
  }).select('id').single()

  if (error || !run) return null

  if (lines.length > 0) {
    await supabaseAdmin.from('payroll_line_items').insert(
      lines.map(l => ({
        payroll_run_id: (run as { id: string }).id,
        business_id: businessId,
        staff_member_id: l.staff_member_id,
        staff_name: l.staff_name,
        position: l.position,
        employment_type: l.employment_type,
        pay_frequency: l.pay_frequency,
        hours_worked: l.hours_worked,
        hourly_rate_cents: l.hourly_rate_cents,
        gross_pay_cents: l.gross_pay_cents,
        superannuation_rate: l.superannuation_rate,
        super_cents: l.super_cents,
        tax_withheld_cents: l.tax_withheld_cents,
        net_estimate_cents: l.net_estimate_cents,
        timesheet_ids: l.timesheet_ids,
      }))
    )
  }

  return (run as { id: string }).id
}

export function generateXeroCsv(
  lines: PayrollLineItem[],
  periodStart: string,
  periodEnd: string,
  businessName: string,
): string {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const dollar = (cents: number) => ((Number(cents) || 0) / 100).toFixed(2)

  const headers = [
    'Employee Name', 'Employment Basis', 'Pay Period Start', 'Pay Period End',
    'Hours', 'Gross Pay', 'Super Amount', 'Tax Withheld', 'Net Pay', 'Notes',
  ]

  const rows = lines.map(l => [
    l.staff_name,
    l.employment_type.replace('_', ' '),
    periodStart,
    periodEnd,
    l.hours_worked.toFixed(2),
    dollar(l.gross_pay_cents),
    dollar(l.super_cents),
    dollar(l.tax_withheld_cents),
    dollar(l.net_estimate_cents),
    `${l.superannuation_rate}% super`,
  ])

  return [
    `# ${businessName} Payroll Export — ${periodStart} to ${periodEnd}`,
    `# Generated by Aria OS on ${new Date().toLocaleDateString('en-AU')}`,
    `# NOTE: Tax withheld is 0 (placeholder). Verify with your accountant.`,
    '',
    headers.map(esc).join(','),
    ...rows.map(r => r.map(esc).join(',')),
  ].join('\n')
}
