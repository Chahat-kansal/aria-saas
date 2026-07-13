export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { buildPayrollRun, savePayrollRun } from '@/lib/staff/payroll'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ runs: [] })

  const { data } = await supabase.from('payroll_runs')
    .select('id, period_start, period_end, status, total_gross_cents, total_super_cents, staff_count, created_at')
    .eq('business_id', bid)
    .order('period_start', { ascending: false })
    .limit(24)

  return NextResponse.json({ runs: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { period_start?: string; period_end?: string }
  const periodStart = String(body.period_start ?? '')
  const periodEnd = String(body.period_end ?? '')
  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: 'period_start and period_end required' }, { status: 400 })
  }

  const lines = await buildPayrollRun(bid, periodStart, periodEnd)
  if (!lines.length) {
    return NextResponse.json({ error: 'No approved timesheets found in this period' }, { status: 422 })
  }

  const runId = await savePayrollRun(bid, user.id, periodStart, periodEnd, lines)
  if (!runId) return NextResponse.json({ error: 'Failed to create payroll run' }, { status: 500 })

  return NextResponse.json({ run_id: runId, line_count: lines.length }, { status: 201 })
}

export const GET = withErrorCapture('staff/payroll', _GET)
export const POST = withErrorCapture('staff/payroll', _POST)
