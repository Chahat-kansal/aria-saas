export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = Math.min(14, parseInt(searchParams.get('days') ?? '7'))

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const fromDate = new Date()
  const toDate = new Date(fromDate.getTime() + days * 86400000)

  const { data: forecasts, error } = await supabaseAdmin
    .from('labour_demand_forecast')
    .select('forecast_date,hour_of_day,required_staff_count,adjusted_predicted_revenue,actual_staff_count,actual_revenue,optimal_labour_cost')
    .eq('business_id', biz.id)
    .gte('forecast_date', fromDate.toISOString().slice(0, 10))
    .lte('forecast_date', toDate.toISOString().slice(0, 10))
    .order('forecast_date')
    .order('hour_of_day')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch roster data
  const { data: timesheets } = await supabaseAdmin
    .from('pos_timesheets')
    .select('staff_member_id,clock_in,clock_out')
    .eq('business_id', biz.id)
    .gte('clock_in', fromDate.toISOString())
    .lte('clock_in', toDate.toISOString())

  const rosterByDateHour: Record<string, number> = {}
  for (const ts of timesheets ?? []) {
    if (!ts.clock_in) continue
    const inTime = new Date(ts.clock_in)
    const outTime = ts.clock_out ? new Date(ts.clock_out) : new Date(inTime.getTime() + 8 * 3600000)
    const dateStr = inTime.toISOString().slice(0, 10)
    for (let h = inTime.getHours(); h <= Math.min(outTime.getHours(), 23); h++) {
      const key = dateStr + ':' + h
      rosterByDateHour[key] = (rosterByDateHour[key] ?? 0) + 1
    }
  }

  // Group by date
  const byDate: Record<string, Array<{ hour: number; required_staff: number; rostered_staff: number; gap: number; adjusted_revenue: number; optimal_labour_cost: number }>> = {}
  let totalOverstaffed = 0, totalUnderstaffed = 0, costWaste = 0, revenueRisk = 0

  for (const f of forecasts ?? []) {
    const dateStr = String(f.forecast_date)
    const rostered = rosterByDateHour[dateStr + ':' + f.hour_of_day] ?? f.actual_staff_count ?? 0
    const required = Number(f.required_staff_count ?? 0)
    const gap = rostered - required
    if (!byDate[dateStr]) byDate[dateStr] = []
    byDate[dateStr].push({
      hour: f.hour_of_day,
      required_staff: required,
      rostered_staff: rostered,
      gap: Math.round(gap * 10) / 10,
      adjusted_revenue: Number(f.adjusted_predicted_revenue ?? 0),
      optimal_labour_cost: Number(f.optimal_labour_cost ?? 0),
    })
    if (gap > 0.4) { totalOverstaffed++; costWaste += gap * 25 }
    else if (gap < -0.4) { totalUnderstaffed++; revenueRisk += Number(f.adjusted_predicted_revenue ?? 0) * 0.15 }
  }

  // Accuracy last 7 days
  const sevenDaysAgo = new Date(fromDate.getTime() - 7 * 86400000).toISOString().slice(0, 10)
  const { data: pastForecasts } = await supabaseAdmin
    .from('labour_demand_forecast')
    .select('forecast_accuracy_pct')
    .eq('business_id', biz.id)
    .gte('forecast_date', sevenDaysAgo)
    .lt('forecast_date', fromDate.toISOString().slice(0, 10))
    .not('forecast_accuracy_pct', 'is', null)

  const accuracyValues = (pastForecasts ?? []).map(f => Number(f.forecast_accuracy_pct ?? 0)).filter(v => v > 0)
  const avgAccuracy = accuracyValues.length > 0 ? accuracyValues.reduce((s, v) => s + v, 0) / accuracyValues.length : null

  return NextResponse.json({
    forecast: Object.entries(byDate).map(([date, hours]) => ({ date, hours })),
    gap_summary: {
      total_overstaffed_hours: totalOverstaffed,
      total_understaffed_hours: totalUnderstaffed,
      estimated_cost_waste: Math.round(costWaste * 100) / 100,
      estimated_revenue_risk: Math.round(revenueRisk * 100) / 100,
    },
    forecast_accuracy_last_week: avgAccuracy ? Math.round(avgAccuracy * 10) / 10 : null,
  })
}

export const GET = withErrorCapture('agents/labour/forecast', _GET)
