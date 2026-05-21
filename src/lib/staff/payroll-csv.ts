/**
 * Pure CSV generation helpers — no DB imports.
 * Extracted so API routes can import without pulling in supabaseAdmin.
 */

export interface PayrollCsvLine {
  staff_name: string
  employment_type: string
  hours_worked: number
  gross_pay_cents: number
  super_cents: number
  tax_withheld_cents: number
  net_pay_cents: number
}

export function generateXeroCsv(
  lines: PayrollCsvLine[],
  periodStart: string,
  periodEnd: string,
  businessName: string,
): string {
  void businessName // included for future header use
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
