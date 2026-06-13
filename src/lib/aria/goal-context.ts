import { supabaseAdmin } from '@/lib/supabase-admin'
import { toAESTStart, startOfWeekAEST } from '@/lib/date-au'

// GOAL-AWARE-1 (I2) — frame every recommendation against the owner's weekly target trajectory.
// Reads businesses.weekly_revenue_target (existing column) + this-week revenue (WEEK-1 calendar
// window). NEVER invents a target — status='no_target' when the column is null, so Aria asks.

export interface GoalContext {
  weekly_target: number | null
  revenue_this_week: number
  days_remaining_in_week: number
  projected_eow_revenue: number
  projection_method: 'linear' | 'dow_weighted'
  on_track_pct: number | null
  gap_to_target: number | null
  pace_required: number | null
  yesterday_actual: number
  status: 'ahead' | 'on_track' | 'behind' | 'critical' | 'no_target'
  reasoning: string
}

export async function computeGoalContext(businessId: string): Promise<GoalContext> {
  const now = Date.now()
  // WEEK-1 calendar week: Monday 00:00 AEST → now
  const weekStartIso = toAESTStart(startOfWeekAEST().toISOString().slice(0, 10))
  // AEST day-of-week (Mon=0..Sun=6) → days elapsed (incl. today) and remaining
  const nowAest = new Date(now + 10 * 3600000)
  const dowMon = (nowAest.getUTCDay() + 6) % 7
  const daysElapsed = dowMon + 1          // today counts as elapsed (partial)
  const daysRemaining = 6 - dowMon        // full days after today (0 on Sunday)
  // yesterday AEST calendar bounds
  const ydayKey = new Date(now + 10 * 3600000 - 86400000).toISOString().slice(0, 10)

  const [bizRes, weekRes, ydayRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('weekly_revenue_target').eq('id', businessId).maybeSingle().then(r => r, () => ({ data: null })),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', weekStartIso).neq('status', 'voided').then(r => r, () => ({ data: null })),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', `${ydayKey}T00:00:00+10:00`).lt('created_at', `${ydayKey}T23:59:59+10:00`).neq('status', 'voided').then(r => r, () => ({ data: null })),
  ])

  const sum = (rows: Array<{ total_amount: number | null }> | null) => (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const rawTarget = (bizRes.data as { weekly_revenue_target?: number | null } | null)?.weekly_revenue_target
  const weekly_target = rawTarget != null && Number(rawTarget) > 0 ? +Number(rawTarget).toFixed(2) : null
  const revenue_this_week = +sum(weekRes.data as Array<{ total_amount: number | null }>).toFixed(2)
  const yesterday_actual = +sum(ydayRes.data as Array<{ total_amount: number | null }>).toFixed(2)

  // Linear extrapolation: pace = so_far / daysElapsed, projected = pace × 7.
  // Late-week guard: with <3 days remaining a tiny denominator over-extrapolates, so cap the
  // projection at 2× current revenue (documented per the spec's "cap at 2× current_pace if days < 3").
  const dailyPace = daysElapsed > 0 ? revenue_this_week / daysElapsed : revenue_this_week
  let projected = +(dailyPace * 7).toFixed(2)
  if (daysRemaining < 3) projected = +Math.min(projected, revenue_this_week * 2).toFixed(2)
  const projection_method: GoalContext['projection_method'] = 'linear'

  let status: GoalContext['status']
  let on_track_pct: number | null = null
  let gap_to_target: number | null = null
  let pace_required: number | null = null
  let reasoning: string

  if (weekly_target == null) {
    status = 'no_target'
    reasoning = `No weekly revenue target set. This week so far: $${revenue_this_week.toFixed(2)}. Ask the owner what target they want before framing progress.`
  } else {
    on_track_pct = +((projected / weekly_target) * 100).toFixed(1)
    gap_to_target = +(weekly_target - projected).toFixed(2)
    pace_required = +((weekly_target - revenue_this_week) / Math.max(1, daysRemaining)).toFixed(2)
    status = on_track_pct >= 110 ? 'ahead' : on_track_pct >= 90 ? 'on_track' : on_track_pct >= 70 ? 'behind' : 'critical'
    reasoning = `This week $${revenue_this_week.toFixed(2)} of $${weekly_target.toFixed(2)} target; projecting $${projected.toFixed(2)} (${on_track_pct}% — ${status}). ${gap_to_target > 0 ? `$${gap_to_target.toFixed(2)} short; need $${pace_required.toFixed(2)}/day over the ${daysRemaining} day(s) left.` : 'on or ahead of pace.'}`
  }

  return {
    weekly_target,
    revenue_this_week,
    days_remaining_in_week: daysRemaining,
    projected_eow_revenue: projected,
    projection_method,
    on_track_pct,
    gap_to_target,
    pace_required,
    yesterday_actual,
    status,
    reasoning,
  }
}
