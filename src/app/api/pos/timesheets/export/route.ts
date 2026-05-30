export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { computeHours } from '@/lib/staff/timesheets'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

interface PayrollRow {
  staff_member_id: string
  staff_name: string
  employment_type: string
  hours_worked: number
  pay_rate_dollars: number
  gross_pay: number
  super_amount: number
  net_pay: number
}

function buildPayrollRows(
  timesheets: Record<string, unknown>[],
  memberMap: Map<string, Record<string, unknown>>,
): PayrollRow[] {
  const byMember = new Map<string, PayrollRow>()

  for (const t of timesheets) {
    const memberId = String(t.staff_member_id ?? '')
    const member = memberMap.get(memberId)
    const firstName = String(member?.first_name ?? '')
    const lastName = String(member?.last_name ?? '')
    const staffName = firstName || lastName ? (firstName + ' ' + lastName).trim() : String(t.staff_name ?? 'Unknown')
    const employmentType = String(member?.employment_type ?? 'casual')
    const payRateCents = Number(member?.pay_rate_cents ?? t.pay_rate_cents ?? 0)
    const superRate = Number(member?.superannuation_rate ?? 11.5)

    const hours = t.clock_out
      ? computeHours(String(t.clock_in), String(t.clock_out), Number(t.break_minutes) || 0)
      : 0

    if (!byMember.has(memberId)) {
      byMember.set(memberId, {
        staff_member_id: memberId,
        staff_name: staffName,
        employment_type: employmentType,
        hours_worked: 0,
        pay_rate_dollars: +(payRateCents / 100).toFixed(2),
        gross_pay: 0,
        super_amount: 0,
        net_pay: 0,
      })
    }

    const row = byMember.get(memberId)!
    const shiftGross = +(hours * (payRateCents / 100)).toFixed(2)
    const shiftSuper = +(shiftGross * superRate / 100).toFixed(2)
    row.hours_worked = +(row.hours_worked + hours).toFixed(2)
    row.gross_pay = +(row.gross_pay + shiftGross).toFixed(2)
    row.super_amount = +(row.super_amount + shiftSuper).toFixed(2)
    row.net_pay = +(row.net_pay + shiftGross).toFixed(2)
  }

  return [...byMember.values()].sort((a, b) => b.gross_pay - a.gross_pay)
}

function buildCsv(rows: PayrollRow[], startDate: string, endDate: string): string {
  const lines: string[] = [
    'Pay Period: ' + startDate + ' to ' + endDate,
    '',
    'Staff Name,Employment Type,Hours Worked,Pay Rate ($/hr),Gross Pay ($),Super ($),Net Pay ($)',
  ]
  for (const r of rows) {
    lines.push(
      [
        '"' + r.staff_name + '"',
        r.employment_type,
        r.hours_worked.toFixed(2),
        r.pay_rate_dollars.toFixed(2),
        r.gross_pay.toFixed(2),
        r.super_amount.toFixed(2),
        r.net_pay.toFixed(2),
      ].join(','),
    )
  }
  const total = rows.reduce((acc, r) => ({
    hours: +(acc.hours + r.hours_worked).toFixed(2),
    gross: +(acc.gross + r.gross_pay).toFixed(2),
    sup: +(acc.sup + r.super_amount).toFixed(2),
    net: +(acc.net + r.net_pay).toFixed(2),
  }), { hours: 0, gross: 0, sup: 0, net: 0 })
  lines.push('')
  lines.push('"TOTAL",,,' + total.hours.toFixed(2) + ',,' + total.gross.toFixed(2) + ',' + total.sup.toFixed(2) + ',' + total.net.toFixed(2))
  return lines.join('\n')
}

function buildPdfHtml(rows: PayrollRow[], startDate: string, endDate: string): string {
  const total = rows.reduce((acc, r) => ({
    hours: +(acc.hours + r.hours_worked).toFixed(2),
    gross: +(acc.gross + r.gross_pay).toFixed(2),
    sup: +(acc.sup + r.super_amount).toFixed(2),
    net: +(acc.net + r.net_pay).toFixed(2),
  }), { hours: 0, gross: 0, sup: 0, net: 0 })

  const rowsHtml = rows.map(r =>
    '<tr>' +
    '<td>' + r.staff_name + '</td>' +
    '<td>' + r.employment_type + '</td>' +
    '<td style="text-align:right">' + r.hours_worked.toFixed(2) + '</td>' +
    '<td style="text-align:right">$' + r.pay_rate_dollars.toFixed(2) + '</td>' +
    '<td style="text-align:right">$' + r.gross_pay.toFixed(2) + '</td>' +
    '<td style="text-align:right">$' + r.super_amount.toFixed(2) + '</td>' +
    '<td style="text-align:right">$' + r.net_pay.toFixed(2) + '</td>' +
    '</tr>',
  ).join('')

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;font-size:13px;color:#111;margin:40px}' +
    'h1{font-size:20px;margin-bottom:4px}p.period{color:#555;margin-bottom:24px}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#1a2a1f;color:#7FB897;text-align:left;padding:8px 10px;font-size:12px}' +
    'td{padding:7px 10px;border-bottom:1px solid #eee}' +
    'tr.total td{font-weight:700;border-top:2px solid #333;background:#f9f9f9}' +
    'th:not(:first-child),td:not(:first-child){text-align:right}' +
    '</style></head><body>' +
    '<h1>Payroll Summary</h1>' +
    '<p class="period">Pay period: ' + startDate + ' to ' + endDate + '</p>' +
    '<table><thead><tr>' +
    '<th>Staff Name</th><th>Type</th><th>Hours</th><th>Pay Rate</th><th>Gross Pay</th><th>Super</th><th>Net Pay</th>' +
    '</tr></thead><tbody>' +
    rowsHtml +
    '<tr class="total"><td>TOTAL</td><td></td>' +
    '<td style="text-align:right">' + total.hours.toFixed(2) + '</td>' +
    '<td></td>' +
    '<td style="text-align:right">$' + total.gross.toFixed(2) + '</td>' +
    '<td style="text-align:right">$' + total.sup.toFixed(2) + '</td>' +
    '<td style="text-align:right">$' + total.net.toFixed(2) + '</td>' +
    '</tr>' +
    '</tbody></table></body></html>'
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const format = searchParams.get('format') ?? 'csv'

  if (!startDate || !endDate) return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 })
  if (!['csv', 'pdf'].includes(format)) return NextResponse.json({ error: 'format must be csv or pdf' }, { status: 400 })

  const [timesheetsQ, membersQ] = await Promise.all([
    supabaseAdmin.from('pos_timesheets')
      .select('staff_member_id, staff_name, clock_in, clock_out, break_minutes, pay_rate_cents, total_pay_cents, hours_worked, approved, status')
      .eq('business_id', bid)
      .gte('clock_in', startDate + 'T00:00:00')
      .lte('clock_in', endDate + 'T23:59:59')
      .eq('status', 'approved')
      .not('clock_out', 'is', null),
    supabaseAdmin.from('staff_members')
      .select('id, first_name, last_name, employment_type, pay_rate_cents, superannuation_rate')
      .eq('business_id', bid)
      .eq('status', 'active'),
  ])

  const memberMap = new Map(
    (membersQ.data ?? []).map((m: Record<string, unknown>) => [String(m.id), m]),
  )

  const rows = buildPayrollRows(timesheetsQ.data ?? [], memberMap)

  if (format === 'csv') {
    const csv = buildCsv(rows, startDate, endDate)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="payroll-' + startDate + '-to-' + endDate + '.csv"',
      },
    })
  }

  // PDF via chromium
  const html = buildPdfHtml(rows, startDate, endDate)
  try {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = (await import('puppeteer-core')).default
    const browser = await puppeteer.launch({ args: chromium.args, defaultViewport: null, executablePath: await chromium.executablePath(), headless: true })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdfUint8 = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }, printBackground: true })
    await browser.close()
    const pdfBuffer = Buffer.from(pdfUint8)
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="payroll-' + startDate + '-to-' + endDate + '.pdf"',
      },
    })
  } catch {
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': 'inline',
      },
    })
  }
}

export const GET = withErrorCapture('pos/timesheets/export', _GET)
