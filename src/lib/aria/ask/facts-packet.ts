import { supabaseAdmin } from '@/lib/supabase-admin'
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
      const dayOfMonth = today.getDate()
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      // Exclusive upper bound: day N+1 of last month — includes all sales on day N
      const comparisonEnd = new Date(today.getFullYear(), today.getMonth() - 1, dayOfMonth + 1)
      const thisMonthStr = firstOfThisMonth.toISOString().slice(0, 7)
      const lastMonthStr = firstOfLastMonth.toISOString().slice(0, 7)
      const dayLabel = `${dayOfMonth} day${dayOfMonth !== 1 ? 's' : ''}`
      return {
        current: {
          start: firstOfThisMonth.toISOString(),
          end: new Date(now).toISOString(),
          label: `${thisMonthStr}-01 to today (${dayLabel}, MTD)`,
        },
        comparison: {
          start: firstOfLastMonth.toISOString(),
          end: comparisonEnd.toISOString(),
          label: `${lastMonthStr}-01 to ${lastMonthStr}-${String(dayOfMonth).padStart(2, '0')} (${dayLabel})`,
        },
        same_length: true,
      }
    }
    case 'same_week_last_month':
      return {
        current: {
          start: new Date(now - 7 * dayMs).toISOString(),
          end: new Date(now).toISOString(),
          label: 'last 7 days',
        },
        comparison: {
          start: new Date(now - 35 * dayMs).toISOString(),
          end: new Date(now - 28 * dayMs).toISOString(),
          label: 'same week last month (d-35 to d-28)',
        },
        same_length: true,
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
      const midnight = new Date()
      midnight.setHours(0, 0, 0, 0)
      return {
        current: {
          start: midnight.toISOString(),
          end: new Date(now).toISOString(),
          label: 'today (since midnight)',
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

  const currentStart = pair?.current.start ?? new Date(now - 7 * 86_400_000).toISOString()
  const currentEnd = pair?.current.end ?? new Date(now).toISOString()

  const [bizResult, currentResult, compResult] = await Promise.all([
    supabaseAdmin.from('businesses').select('weekly_revenue_target').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId)
      .gte('created_at', currentStart).lt('created_at', currentEnd).neq('status', 'voided'),
    pair?.comparison
      ? supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId)
          .gte('created_at', pair.comparison.start).lt('created_at', pair.comparison.end).neq('status', 'voided')
      : Promise.resolve({ data: null, error: null }),
  ])

  const rawTarget = bizResult.data?.weekly_revenue_target
  const weekly_revenue_target = rawTarget ? Number(rawTarget) : null
  if (!weekly_revenue_target) caveats.push("weekly_revenue_target NOT SET — never substitute an average as proxy")

  const current_period_revenue = (currentResult.data ?? []).reduce(
    (s: number, r: { total_amount: number | null }) => s + Number(r.total_amount ?? 0), 0,
  )
  const current_window = pair?.current.label ?? 'last 7 days'

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

  if (weekly_revenue_target && weekly_revenue_target > 0) {
    pct_of_target = Math.round((current_period_revenue / weekly_revenue_target) * 100)
    on_track = current_period_revenue >= weekly_revenue_target ? 'on_track' : 'behind'
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
