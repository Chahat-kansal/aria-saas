export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { buildLabourReport } from '@/lib/staff/timesheets'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ report: [] })

  const url = new URL(req.url)
  const from = url.searchParams.get('from') ?? new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10)
  const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10)
  const format = url.searchParams.get('format') ?? 'json'

  const report = await buildLabourReport(bid, from + 'T00:00:00', to + 'T23:59:59')
  const totalCents = report.reduce((s, r) => s + r.total_pay_cents, 0)
  const totalHours = report.reduce((s, r) => s + r.total_hours, 0)

  if (format === 'csv') {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = ['Name', 'Position', 'Employment', 'Hours', 'Est. Pay ($)', 'Shifts', 'Approved', 'Pending']
    const rows = report.map(r => [
      r.staff_name, r.position, r.employment_type,
      r.total_hours.toFixed(2), (r.total_pay_cents / 100).toFixed(2),
      String(r.shift_count), String(r.approved_count), String(r.pending_count),
    ])
    const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="labour-report-${from}-${to}.csv"`,
      },
    })
  }

  return NextResponse.json({ report, totalCents, totalHours: +totalHours.toFixed(2), from, to })
}

export const GET = withErrorCapture('staff/timesheets/report', _GET)
