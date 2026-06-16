export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { computeWeekStart } from '@/lib/reports/weekly-data'
import { aggregateWeeklyReport } from '@/lib/reports/weekly-aggregate'

// WBI-1 — aggregate a week's grounded figures and persist ONE pos_weekly_reports row per business per
// week (idempotent via the business_id+week_start unique key). Aggregation only — rendering (WBI-2)
// and scheduling/delivery (WBI-3) are separate.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string; week_start?: string }
  if (!body.business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, timezone').eq('id', body.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tz = (biz as { timezone?: string }).timezone ?? 'Australia/Melbourne'
  const weekStart = body.week_start ? new Date(body.week_start + 'T00:00:00.000Z') : computeWeekStart(tz)

  const report = await aggregateWeeklyReport(body.business_id, weekStart)

  // Idempotent: one row per (business_id, week_start). Re-running refreshes the same row.
  const { error } = await supabaseAdmin.from('pos_weekly_reports').upsert({
    business_id: body.business_id,
    week_start: report.week_start,
    week_end: report.week_end,
    report_data: report,
    send_status: 'pending',
  }, { onConflict: 'business_id,week_start' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, report })
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const business_id = new URL(req.url).searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabaseAdmin.from('pos_weekly_reports')
    .select('id, week_start, week_end, report_data, send_status, created_at')
    .eq('business_id', business_id)
    .order('week_start', { ascending: false })
    .limit(12)
  return NextResponse.json({ reports: data ?? [] })
}

export const POST = withErrorCapture('reports/weekly-aggregate', _POST)
export const GET = withErrorCapture('reports/weekly-aggregate', _GET)
