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
  tax_withheld_cents: number
  superannuation_rate: number
  super_cents: number
  net_pay_cents: number
  allowances_cents: number
  timesheet_ids: string[]
  ytd_gross_cents: number
  penalty_extra_cents?: number
  bank_bsb: string | null
  bank_account: string | null
  bank_account_name: string | null
  tax_free_threshold: boolean
}

// ─── Australian 2024-25 Tax Tables ────────────────────────────────────────
// Weekly earnings brackets → annual withholding (simplified Schedule 1)
// Source: ATO Tax Withholding Calculator (Scale 2 - resident, with TFN)
function calcWeeklyTax(weeklyGross: number, taxFreeThreshold: boolean): number {
  const annual = weeklyGross * 52
  let annualTax = 0

  if (taxFreeThreshold) {
    // Resident with tax-free threshold
    if (annual <= 18200) annualTax = 0
    else if (annual <= 26000) annualTax = (annual - 18200) * 0.19
    else if (annual <= 37000) annualTax = 1482 + (annual - 26000) * 0.19
    else if (annual <= 45000) annualTax = 3572 + (annual - 37000) * 0.325
    else if (annual <= 120000) annualTax = 6172 + (annual - 45000) * 0.325
    else if (annual <= 135000) annualTax = 30592 + (annual - 120000) * 0.37
    else if (annual <= 180000) annualTax = 36142 + (annual - 135000) * 0.37
    else annualTax = 52822 + (annual - 180000) * 0.45
  } else {
    // No tax-free threshold
    if (annual <= 18200) annualTax = annual * 0.19
    else if (annual <= 37000) annualTax = 3458 + (annual - 18200) * 0.195
    else if (annual <= 87000) annualTax = 7123 + (annual - 37000) * 0.325
    else if (annual <= 180000) annualTax = 23348 + (annual - 87000) * 0.37
    else annualTax = 57798 + (annual - 180000) * 0.45
  }

  // Add Medicare levy (2%)
  if (annual > 26000) annualTax += annual * 0.02

  return Math.max(0, Math.round(annualTax / 52))
}

function calcFortnightlyTax(fortnightlyGross: number, taxFreeThreshold: boolean): number {
  return calcWeeklyTax(fortnightlyGross / 2, taxFreeThreshold) * 2
}

function calcMonthlyTax(monthlyGross: number, taxFreeThreshold: boolean): number {
  return Math.round(calcWeeklyTax((monthlyGross * 12) / 52, taxFreeThreshold) * (52 / 12))
}

function withholdingForPeriod(grossCents: number, payFrequency: string, taxFreeThreshold: boolean): number {
  const gross = grossCents / 100
  switch (payFrequency) {
    case 'weekly': return calcWeeklyTax(gross, taxFreeThreshold) * 100
    case 'fortnightly': return calcFortnightlyTax(gross, taxFreeThreshold) * 100
    case 'monthly': return calcMonthlyTax(gross, taxFreeThreshold) * 100
    default: return calcWeeklyTax(gross, taxFreeThreshold) * 100
  }
}


// ─── Fair Work Penalty Rates (Australian retail/hospitality) ──────────────
// Source: Fair Work Commission General Retail Industry Award 2020
export function getPenaltyMultiplier(date: string, startHour: number): number {
  const d = new Date(date + 'T12:00:00')
  const dow = d.getDay() // 0=Sun, 6=Sat
  const isPublicHoliday = checkPublicHoliday(date)

  if (isPublicHoliday) return 2.25  // 225% public holiday
  if (dow === 0) return 2.0          // 200% Sunday
  if (dow === 6) return 1.25         // 125% Saturday
  if (startHour >= 18 || startHour < 6) return 1.15  // 115% evening/early
  return 1.0                         // ordinary time
}

// Australian public holidays (national + vic approximation)
function checkPublicHoliday(date: string): boolean {
  const d = new Date(date + 'T12:00:00')
  const month = d.getMonth() + 1
  const day = d.getDate()
  const dow = d.getDay()

  // Fixed national holidays
  if (month === 1 && day === 1) return true   // New Year's Day
  if (month === 1 && day === 26) return true  // Australia Day
  if (month === 4 && day === 25) return true  // Anzac Day
  if (month === 12 && day === 25) return true // Christmas Day
  if (month === 12 && day === 26) return true // Boxing Day

  // Easter (approximate — Good Friday/Easter Monday)
  // Melbourne Cup first Tuesday in November
  if (month === 11 && dow === 2 && day <= 7) return true

  return false
}

export function applyPenaltyRates(
  lines: PayrollLineItem[],
  timesheets: Array<{ clock_in: string; clock_out: string | null; staff_member_id: string | null; total_pay_cents: number }>
): PayrollLineItem[] {
  return lines.map(line => {
    const staffShifts = timesheets.filter(t => t.staff_member_id === line.staff_member_id)
    let penaltyExtra = 0

    for (const shift of staffShifts) {
      const date = shift.clock_in.slice(0, 10)
      const startHour = new Date(shift.clock_in).getHours()
      const multiplier = getPenaltyMultiplier(date, startHour)
      if (multiplier > 1.0) {
        // Extra pay on top of base
        penaltyExtra += Math.round(Number(shift.total_pay_cents) * (multiplier - 1.0))
      }
    }

    const newGross = line.gross_pay_cents + penaltyExtra
    const newSuper = Math.round(newGross * line.superannuation_rate / 100)
    const newTax = withholdingForPeriod(newGross, line.pay_frequency, line.tax_free_threshold)
    const newNet = Math.max(0, newGross - newTax)

    return { ...line, gross_pay_cents: newGross, super_cents: newSuper, tax_withheld_cents: newTax, net_pay_cents: newNet, penalty_extra_cents: penaltyExtra }
  })
}

// ─── Build Payroll Run ─────────────────────────────────────────────────────
export async function buildPayrollRun(
  businessId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PayrollLineItem[]> {
  const { data: timesheets } = await supabaseAdmin
    .from('pos_timesheets')
    .select('id, staff_member_id, staff_name, clock_in, clock_out, break_minutes, total_pay_cents, pay_rate_cents, break_type, hours_worked, is_overtime, overtime_cents')
    .eq('business_id', businessId)
    .eq('approved', true)
    .gte('clock_in', periodStart + 'T00:00:00')
    .lte('clock_in', periodEnd + 'T23:59:59')

  const memberIds = [...new Set((timesheets ?? []).map(t => t.staff_member_id).filter(Boolean))] as string[]

  const { data: members } = await supabaseAdmin
    .from('staff_members')
    .select('id, first_name, last_name, position, employment_type, pay_frequency, superannuation_rate, pay_rate_cents, tax_free_threshold, ytd_gross_cents, bank_bsb, bank_account, bank_account_name')
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
      byStaff.set(key, { timesheet_ids: [], total_pay_cents: 0, hours_worked: 0, pay_rate_cents: Number(t.pay_rate_cents) || 0, staff_name: String(t.staff_name ?? '') })
    }
    const row = byStaff.get(key)!
    row.timesheet_ids.push(String(t.id))
    row.total_pay_cents += Number(t.total_pay_cents) || 0
    if (t.clock_out) {
      const h = Number(t.hours_worked) || 0
      row.hours_worked += h
    }
  }

  const lines: PayrollLineItem[] = []

  for (const [staffId, agg] of byStaff) {
    const member = memberMap.get(staffId)
    const superRate = Number(member?.superannuation_rate) || 11.5
    const payFreq = member?.pay_frequency ?? 'weekly'
    const taxFree = member?.tax_free_threshold !== false
    const grossCents = Math.round(Number(agg.total_pay_cents) || 0)
    const superCents = Math.round(grossCents * superRate / 100)
    const taxCents = withholdingForPeriod(grossCents, payFreq, taxFree)
    const netCents = Math.max(0, grossCents - taxCents)
    const ytdGross = Number(member?.ytd_gross_cents) || 0

    lines.push({
      staff_member_id: member ? String(member.id) : null,
      staff_name: member ? `${member.first_name} ${member.last_name}` : agg.staff_name,
      position: member?.position ?? 'Staff',
      employment_type: member?.employment_type ?? 'casual',
      pay_frequency: payFreq,
      hours_worked: Math.round(agg.hours_worked * 100) / 100,
      hourly_rate_cents: agg.pay_rate_cents,
      gross_pay_cents: grossCents,
      tax_withheld_cents: taxCents,
      superannuation_rate: superRate,
      super_cents: superCents,
      net_pay_cents: netCents,
      allowances_cents: 0,
      timesheet_ids: agg.timesheet_ids,
      ytd_gross_cents: ytdGross + grossCents,
      bank_bsb: member?.bank_bsb ?? null,
      bank_account: member?.bank_account ?? null,
      bank_account_name: member?.bank_account_name ?? (member ? `${member.first_name} ${member.last_name}` : null),
      tax_free_threshold: taxFree,
    })
  }

  return lines
}

// ─── Save Payroll Run ──────────────────────────────────────────────────────
export async function savePayrollRun(
  businessId: string,
  userId: string,
  periodStart: string,
  periodEnd: string,
  lines: PayrollLineItem[],
): Promise<string | null> {
  const totalGross = lines.reduce((s, l) => s + l.gross_pay_cents, 0)
  const totalSuper = lines.reduce((s, l) => s + l.super_cents, 0)
  const totalTax = lines.reduce((s, l) => s + l.tax_withheld_cents, 0)
  const totalNet = lines.reduce((s, l) => s + l.net_pay_cents, 0)

  const { data: run, error } = await supabaseAdmin.from('payroll_runs').insert({
    business_id: businessId,
    created_by: userId,
    period_start: periodStart,
    period_end: periodEnd,
    status: 'draft',
    total_gross_cents: totalGross,
    total_super_cents: totalSuper,
    total_tax_cents: totalTax,
    total_net_estimate_cents: totalNet,
    staff_count: lines.length,
    line_items: lines,
  }).select('id').single()

  if (error || !run) return null

  // Save individual line items
  for (const l of lines) {
    await supabaseAdmin.from('payroll_line_items').insert({
      payroll_run_id: run.id,
      business_id: businessId,
      staff_member_id: l.staff_member_id,
      staff_name: l.staff_name,
      position: l.position,
      employment_type: l.employment_type,
      pay_frequency: l.pay_frequency,
      hours_worked: l.hours_worked,
      hourly_rate_cents: l.hourly_rate_cents,
      gross_pay_cents: l.gross_pay_cents,
      tax_withheld_cents: l.tax_withheld_cents,
      superannuation_rate: l.superannuation_rate,
      super_cents: l.super_cents,
      net_pay_cents: l.net_pay_cents,
      ytd_gross_cents: l.ytd_gross_cents,
      timesheet_ids: l.timesheet_ids,
    })
  }

  return run.id
}

// ─── Generate ABA File (Australian Banking Association) ───────────────────
export function generateABA(
  lines: PayrollLineItem[],
  business: { name: string; abn?: string; bank_bsb?: string; bank_account?: string },
  periodEnd: string,
  description: string = 'PAYROLL',
): string {
  const bsb = (business.bank_bsb ?? '000-000').replace('-', '')
  const account = (business.bank_account ?? '000000000').padStart(9, '0')
  const businessName = business.name.toUpperCase().slice(0, 26).padEnd(26, ' ')
  const date = new Date(periodEnd).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '')
  const desc = description.toUpperCase().slice(0, 12).padEnd(12, ' ')

  // Descriptive record (header)
  const header = `0${' '.repeat(17)}01${bsb.padEnd(7)}${account.padEnd(9)}${' '.repeat(2)}${businessName}${date}${desc}${' '.repeat(40)}`

  // Detail records
  const details: string[] = []
  let totalCredit = 0
  let totalDebit = 0
  let recordCount = 0

  for (const line of lines) {
    if (!line.bank_bsb || !line.bank_account || line.net_pay_cents <= 0) continue
    const staffBsb = line.bank_bsb.replace('-', '').padStart(6, '0')
    const staffAccount = line.bank_account.padStart(9, '0')
    const staffName = (line.bank_account_name ?? line.staff_name).toUpperCase().slice(0, 32).padEnd(32, ' ')
    const amount = String(line.net_pay_cents).padStart(10, '0')
    const lodgement = 'PAYROLL'.padEnd(18, ' ')
    const traceBsb = bsb.padStart(6, '0')
    const traceAccount = account.padStart(9, '0')
    const remitter = businessName.slice(0, 16).padEnd(16, ' ')
    const withheld = '00000000000'

    details.push(`1${staffBsb} ${staffAccount}0 ${amount}${staffName}${lodgement}${traceBsb} ${traceAccount}${remitter}${withheld}`)
    totalCredit += line.net_pay_cents
    recordCount++
  }

  // File total record
  const netAmount = String(Math.abs(totalCredit - totalDebit)).padStart(10, '0')
  const creditTotal = String(totalCredit).padStart(10, '0')
  const debitTotal = String(totalDebit).padStart(10, '0')
  const footer = `7999-999            ${netAmount}${creditTotal}${debitTotal}${' '.repeat(24)}${String(recordCount).padStart(6, '0')}${' '.repeat(40)}`

  return [header, ...details, footer].join('\n')
}

// ─── Format helpers ────────────────────────────────────────────────────────
export function dollar(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// ─── Xero CSV export ────────────────────────────────────────────────────────
export function generateXeroCsv(
  lines: PayrollLineItem[],
  periodStart: string,
  periodEnd: string,
  businessName: string,
): string {
  const rows: string[][] = [
    ['Employee Name', 'Earnings Rate', 'Hours', 'Earnings Amount', 'Super Amount', 'Tax Amount', 'Net Pay', 'Period Start', 'Period End'],
  ]
  for (const l of lines) {
    rows.push([
      l.staff_name,
      l.employment_type === 'salary' ? 'Salary' : 'Ordinary Hours',
      l.hours_worked.toFixed(2),
      (l.gross_pay_cents / 100).toFixed(2),
      (l.super_cents / 100).toFixed(2),
      (l.tax_withheld_cents / 100).toFixed(2),
      (l.net_pay_cents / 100).toFixed(2),
      periodStart,
      periodEnd,
    ])
  }
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}
