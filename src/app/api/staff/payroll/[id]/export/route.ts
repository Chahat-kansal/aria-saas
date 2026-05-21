export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { generateXeroCsv } from '@/lib/staff/payroll'
import type { PayrollLineItem } from '@/lib/staff/payroll'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [runQ, linesQ, bizQ] = await Promise.all([
    supabase.from('payroll_runs').select('period_start, period_end, status').eq('id', params.id).eq('business_id', bid).maybeSingle(),
    supabase.from('payroll_line_items').select('*').eq('payroll_run_id', params.id),
    supabase.from('businesses').select('name').eq('id', bid).maybeSingle(),
  ])

  if (!runQ.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lines = (linesQ.data ?? []).map(l => ({ // eslint-disable-line
    staff_member_id: l.staff_member_id as string | null,
    staff_name: String(l.staff_name),
    position: String(l.position ?? ''),
    employment_type: String(l.employment_type ?? 'casual'),
    pay_frequency: String(l.pay_frequency ?? 'fortnightly'),
    hours_worked: Number(l.hours_worked) || 0,
    hourly_rate_cents: Number(l.hourly_rate_cents) || 0,
    gross_pay_cents: Number(l.gross_pay_cents) || 0,
    superannuation_rate: Number(l.superannuation_rate) || 11.5,
    super_cents: Number(l.super_cents) || 0,
    tax_withheld_cents: Number(l.tax_withheld_cents) || 0,
    net_pay_cents: Number(l.net_estimate_cents ?? l.net_pay_cents) || 0,
    timesheet_ids: (l.timesheet_ids as string[]) ?? [],
    allowances_cents: 0, ytd_gross_cents: 0,
    bank_bsb: null, bank_account: null, bank_account_name: null, tax_free_threshold: false,
  })) as PayrollLineItem[]

  const csv = generateXeroCsv(
    lines,
    String(runQ.data.period_start),
    String(runQ.data.period_end),
    String(bizQ.data?.name ?? 'Business'),
  )

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="payroll-${runQ.data.period_start}-${runQ.data.period_end}.csv"`,
    },
  })
}

export const GET = withErrorCapture('staff/payroll/[id]/export', _GET)
