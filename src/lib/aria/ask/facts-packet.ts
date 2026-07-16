import { supabaseAdmin } from '@/lib/supabase-admin'
import { todayAEST, toAESTStart, startOfWeekAEST } from '@/lib/date-au'
import type { ComparisonPeriod } from './aria-intent'

export interface FactsPacket {
  detected_comparison_period: string | null
  current_period_revenue: number | null
  current_window: string | null
  comparison_revenue: number | null
  comparison_window: string | null
  periods_are_same_length: boolean
  pct_change: string | null
  weekly_revenue_target: number | null
  on_track: 'on_track' | 'behind' | null
  pct_of_target: number | null
  caveats: string[]
}

interface WindowSpec {
  start: string
  end: string
  label: string
}

interface WindowPair {
  current: WindowSpec
  comparison: WindowSpec | null
  same_length: boolean
}

function windowPairForPeriod(period: ComparisonPeriod): WindowPair | null {
  const now = Date.now()
  const dayMs = 86_400_000
  const today = new Date()

  switch (period) {
    case 'last_month': {
      // Canonical definition (verified by direct SQL 2026-06-08):
      //   current    = YYYY-MM-01 00:00:00 UTC (incl) → YYYY-MM-{N+1} 00:00:00 UTC (excl)
      //   comparison = YYYY-{M-1}-01 00:00:00 UTC (incl) → YYYY-{M-1}-{N+1} 00:00:00 UTC (excl)
      //   where N = UTC day-of-month of today.  Both windows are exactly N full calendar days.
      //   Column: pos_sales.total_amount, status != 'voided', UTC, calendar-day-aligned.
      //   Both ends use new Date(year, monthIndex, day+1) — identical boundary logic, no TZ drift.
      const dayOfMonth = today.getDate()
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      // N+1 of this month: exclusive upper bound so all N full days are included in both windows
      const currentEnd = new Date(today.getFullYear(), today.getMonth(), dayOfMonth + 1)
      const comparisonEnd = new Date(today.getFullYear(), today.getMonth() - 1, dayOfMonth + 1)
      const thisMonthStr = firstOfThisMonth.toISOString().slice(0, 7)
      const lastMonthStr = firstOfLastMonth.toISOString().slice(0, 7)
      const dayLabel = `${dayOfMonth} day${dayOfMonth !== 1 ? 's' : ''}`
      return {
        current: {
          start: firstOfThisMonth.toISOString(),
          end: currentEnd.toISOString(),
          label: `${thisMonthStr}-01 to ${thisMonthStr}-${String(dayOfMonth).padStart(2, '0')} (${dayLabel}, MTD)`,
        },
        comparison: {
          start: firstOfLastMonth.toISOString(),
          end: comparisonEnd.toISOString(),
          label: `${lastMonthStr}-01 to ${lastMonthStr}-${String(dayOfMonth).padStart(2, '0')} (${dayLabel})`,
        },
        same_length: true,
      }
    }
    case 'same_week_last_month': {
      // SWLM-1: calendar-Monday-aligned, 28-day-shifted — replaces the d-35/d-28 rolling window
      // whose request-time anchoring caused the $4,419/$4,442/$4,553 drift (AUDIT-1 finding #2).
      const monShifted = startOfWeekAEST() // shifted Date — its ISO date-part IS the AEST Monday
      const thisMonIso = toAESTStart(monShifted.toISOString().slice(0, 10))
      const swlmStartIso = new Date(new Date(thisMonIso).getTime() - 28 * dayMs).toISOString()
      const swlmEndIso = new Date(new Date(thisMonIso).getTime() - 21 * dayMs).toISOString()
      const swlmMonStr = new Date(monShifted.getTime() - 28 * dayMs).toISOString().slice(0, 10)
      const swlmSunStr = new Date(monShifted.getTime() - 22 * dayMs).toISOString().slice(0, 10)
      return {
        current: {
          start: thisMonIso,
          end: new Date(now).toISOString(),
          label: 'this week (Mon 00:00 AEST → now)',
        },
        comparison: {
          start: swlmStartIso,
          end: swlmEndIso,
          label: `same calendar week last month (Mon ${swlmMonStr} → Sun ${swlmSunStr}, 4 weeks ago)`,
        },
        // week-to-date vs a FULL week — honestly flagged so pct_change is suppressed with a caveat
        same_length: false,
      }
    }
    case 'last_week':
      return {
        current: {
          start: new Date(now - 7 * dayMs).toISOString(),
          end: new Date(now).toISOString(),
          label: 'last 7 days',
        },
        comparison: {
          start: new Date(now - 14 * dayMs).toISOString(),
          end: new Date(now - 7 * dayMs).toISOString(),
          label: 'prior 7 days (d-14 to d-7)',
        },
        same_length: true,
      }
    case 'last_year':
      return {
        current: {
          start: new Date(now - 7 * dayMs).toISOString(),
          end: new Date(now).toISOString(),
          label: 'last 7 days',
        },
        comparison: {
          start: new Date(now - 372 * dayMs).toISOString(),
          end: new Date(now - 365 * dayMs).toISOString(),
          label: 'same week last year (d-372 to d-365)',
        },
        same_length: true,
      }
    case 'today': {
      // TZ-1: AEST midnight, not server/UTC midnight
      return {
        current: {
          start: toAESTStart(todayAEST()),
          end: new Date(now).toISOString(),
          label: 'today (since midnight AEST)',
        },
        comparison: null,
        same_length: false,
      }
    }
    default:
      return null
  }
}

export async function buildFactsPacket(
  businessId: string,
  comparisonPeriod: ComparisonPeriod,
): Promise<FactsPacket> {
  const caveats: string[] = []
  const now = Date.now()
  const pair = windowPairForPeriod(comparisonPeriod)

  // WEEK-1-EXTEND: when NO comparison period was detected (e.g. "how am I doing this week?"),
  // the default current window is the CALENDAR week (Mon 00:00 AEST → now), not rolling 7 days —
  // on_track / pct_of_target below compare against the WEEKLY target, so the window must match.
  // Named comparison cases (last_week / SWLM / last_year) keep their own honest windows above.
  const calWeekStartIso = toAESTStart(startOfWeekAEST().toISOString().slice(0, 10))
  const currentStart = pair?.current.start ?? calWeekStartIso
  const currentEnd = pair?.current.end ?? new Date(now).toISOString()
  // SWLM-1 (WEEK-1-EXTEND flagged caveat): on_track / pct_of_target compare against the WEEKLY
  // target, so they must always read the CALENDAR week — even when the named comparison case
  // uses a different current window (last_week / last_year / last_month MTD).
  const currentIsCalendarWeek = currentStart === calWeekStartIso

  // INTEL-COMPUTE-3 — all 3 pos_sales queries below used neq('voided') (admitted draft/refunded
  // rows) — one of 4 near-duplicate "same week last month"/intent-grounded-comparison
  // implementations in the Ask Aria chain (see get-business-context.ts, ask/route.ts, both fixed
  // alongside this one). status='completed' is the canonical filter getRevenueSnapshot() uses.
  const [bizResult, currentResult, compResult, calWeekResult] = await Promise.all([
    supabaseAdmin.from('businesses').select('weekly_revenue_target').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId)
      .gte('created_at', currentStart).lt('created_at', currentEnd).eq('status', 'completed'),
    pair?.comparison
      ? supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId)
          .gte('created_at', pair.comparison.start).lt('created_at', pair.comparison.end).eq('status', 'completed')
      : Promise.resolve({ data: null, error: null }),
    currentIsCalendarWeek
      ? Promise.resolve({ data: null, error: null })
      : supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId)
          .gte('created_at', calWeekStartIso).eq('status', 'completed'),
  ])

  const rawTarget = bizResult.data?.weekly_revenue_target
  const weekly_revenue_target = rawTarget ? Number(rawTarget) : null
  if (!weekly_revenue_target) caveats.push("weekly_revenue_target NOT SET — never substitute an average as proxy")

  const current_period_revenue = (currentResult.data ?? []).reduce(
    (s: number, r: { total_amount: number | null }) => s + Number(r.total_amount ?? 0), 0,
  )
  const current_window = pair?.current.label ?? 'this week (Mon 00:00 AEST → now)'

  let comparison_revenue: number | null = null
  let pct_change: string | null = null

  if (pair?.comparison && compResult.data && compResult.data.length > 0) {
    comparison_revenue = (compResult.data as Array<{ total_amount: number | null }>).reduce(
      (s, r) => s + Number(r.total_amount ?? 0), 0,
    )
    if (pair.same_length && comparison_revenue > 0) {
      const chg = ((current_period_revenue - comparison_revenue) / comparison_revenue) * 100
      pct_change = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%'
    } else if (!pair.same_length) {
      caveats.push('Periods are different lengths — % change not computed to avoid misleading comparison')
    }
  } else if (pair?.comparison) {
    caveats.push(`No sales data for comparison window: ${pair.comparison.label}`)
  }

  let on_track: 'on_track' | 'behind' | null = null
  let pct_of_target: number | null = null

  // SWLM-1: target tracking ALWAYS reads the calendar week (Mon 00:00 AEST → now)
  const calendar_week_revenue = currentIsCalendarWeek
    ? current_period_revenue
    : (calWeekResult.data ?? []).reduce(
        (s: number, r: { total_amount: number | null }) => s + Number(r.total_amount ?? 0), 0,
      )

  if (weekly_revenue_target && weekly_revenue_target > 0) {
    pct_of_target = Math.round((calendar_week_revenue / weekly_revenue_target) * 100)
    on_track = calendar_week_revenue >= weekly_revenue_target ? 'on_track' : 'behind'
  }

  return {
    detected_comparison_period: comparisonPeriod,
    current_period_revenue,
    current_window,
    comparison_revenue,
    comparison_window: pair?.comparison?.label ?? null,
    periods_are_same_length: pair?.same_length ?? false,
    pct_change,
    weekly_revenue_target,
    on_track,
    pct_of_target,
    caveats,
  }
}
