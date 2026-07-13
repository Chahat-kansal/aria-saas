export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [runQ, linesQ] = await Promise.all([
    supabase.from('payroll_runs').select('*').eq('id', params.id).eq('business_id', bid).maybeSingle(),
    supabase.from('payroll_line_items').select('*').eq('payroll_run_id', params.id).order('gross_pay_cents', { ascending: false }),
  ])

  if (!runQ.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ run: runQ.data, lines: linesQ.data ?? [] })
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: run } = await supabase.from('payroll_runs')
    .select('status').eq('id', params.id).eq('business_id', bid).maybeSingle()
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (run.status === 'approved') return NextResponse.json({ error: 'Already approved' }, { status: 409 })

  const now = new Date().toISOString()
  await supabaseAdmin.from('payroll_runs').update({
    status: 'approved',
    approved_by: user.id,
    approved_at: now,
    updated_at: now,
  }).eq('id', params.id)

  // Lock all timesheets included in this run
  const { data: lines } = await supabase.from('payroll_line_items')
    .select('timesheet_ids').eq('payroll_run_id', params.id)
  const allIds = (lines ?? []).flatMap(l => (l.timesheet_ids as string[]) ?? [])
  if (allIds.length > 0) {
    await supabaseAdmin.from('pos_timesheets')
      .update({ status: 'approved', approved: true, approved_by: user.id, approved_at: now })
      .in('id', allIds)
  }

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('staff/payroll/[id]', _GET)
export const PATCH = withErrorCapture('staff/payroll/[id]', _PATCH)
