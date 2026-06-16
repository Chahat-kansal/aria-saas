export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { renderWeeklyReportHtml } from '@/lib/reports/weekly-html'
import type { WeeklyAggregate } from '@/lib/reports/weekly-aggregate'

// WBI-2 — render a stored pos_weekly_reports row (WBI-1's report_data) into shareable HTML. Reads
// report_data only; performs NO re-aggregation and invents NO numbers. ?week_start=YYYY-MM-DD selects
// a week; otherwise the most recent report is rendered.
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const week_start = searchParams.get('week_start')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, name, trading_name').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let q = supabaseAdmin.from('pos_weekly_reports')
    .select('week_start, week_end, report_data')
    .eq('business_id', business_id)
  if (week_start) q = q.eq('week_start', week_start)
  const { data: row } = await q.order('week_start', { ascending: false }).limit(1).maybeSingle()

  if (!row?.report_data) {
    return NextResponse.json({ error: 'No weekly report found — generate one first (WBI-1).' }, { status: 404 })
  }

  const businessName = ((biz as { trading_name?: string | null; name?: string | null }).trading_name
    || (biz as { name?: string | null }).name || 'Your business') as string
  const html = renderWeeklyReportHtml(row.report_data as WeeklyAggregate, businessName)

  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export const GET = withErrorCapture('reports/weekly-html', _GET)
