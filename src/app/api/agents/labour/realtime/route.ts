export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { todayAEST, toAESTStart } from '@/lib/date-au'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const midnight = new Date(toAESTStart(todayAEST())) // TZ-1: true AEST-midnight instant
  const now = new Date()

  const [activeStaffRes, revTodayRes, settingsRes] = await Promise.all([
    // INTEL-COMPUTE-2 — joined staff_members(hourly_rate) only, a column that defaults to 25 and
    // nothing in the app ever writes to. pay_rate_cents (cents, correctly populated) is the real column.
    supabaseAdmin
      .from('pos_timesheets')
      .select('clock_in,staff_member_id,staff_members(hourly_rate,pay_rate_cents)')
      .eq('business_id', biz.id)
      .is('clock_out', null),
    supabaseAdmin
      .from('pos_sales')
      .select('total_amount')
      .eq('business_id', biz.id)
      .gte('created_at', midnight.toISOString())
      .eq('status', 'completed'), // INTEL-COMPUTE-2 — was neq('voided'), admitted draft/refunded
    supabaseAdmin
      .from('agent_settings')
      .select('config')
      .eq('business_id', biz.id)
      .eq('agent_type', 'labour_optimisation')
      .maybeSingle(),
  ])

  const cfg = (settingsRes.data?.config as Record<string, unknown>) ?? {}
  const threshold = Number(cfg.labour_pct_threshold ?? 38)
  const targetPct = Number(cfg.target_labour_pct ?? 30)

  const nowSec = now.getTime() / 1000
  let labourCostSoFar = 0
  const activeStaff = activeStaffRes.data ?? []
  for (const ts of activeStaff) {
    if (!ts.clock_in) continue
    const hoursElapsed = (nowSec - new Date(ts.clock_in).getTime() / 1000) / 3600
    const sm = (ts as { staff_members?: { hourly_rate?: number; pay_rate_cents?: number } }).staff_members
    const rateCents = sm?.pay_rate_cents ?? (sm?.hourly_rate ? Math.round(Number(sm.hourly_rate) * 100) : 2500)
    labourCostSoFar += hoursElapsed * (rateCents / 100)
  }
  const revenueToday = (revTodayRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount ?? 0), 0)
  const labourPct = revenueToday > 0 ? (labourCostSoFar / revenueToday) * 100 : 0

  return NextResponse.json({
    labour_pct: Math.round(labourPct * 10) / 10,
    active_staff_count: activeStaff.length,
    cost_so_far: Math.round(labourCostSoFar * 100) / 100,
    revenue_today: Math.round(revenueToday * 100) / 100,
    threshold_pct: threshold,
    target_pct: targetPct,
    over_threshold: labourPct > threshold,
  })
}

export const GET = withErrorCapture('agents/labour/realtime', _GET)
