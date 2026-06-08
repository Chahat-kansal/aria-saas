import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ComparisonPeriod } from './aria-intent'

export interface FactsPacket {
  detected_comparison_period: string | null
  current_7d_revenue: number | null
  comparison_revenue: number | null
  comparison_window: string | null
  pct_change: string | null
  weekly_revenue_target: number | null
  on_track: 'on_track' | 'behind' | null
  pct_of_target: number | null
  caveats: string[]
}

interface ComparisonWindow {
  start: string
  end: string
  label: string
}

function comparisonWindow(period: ComparisonPeriod): ComparisonWindow | null {
  const now = Date.now()
  const dayMs = 86_400_000

  switch (period) {
    case 'same_week_last_month':
      return {
        start: new Date(now - 35 * dayMs).toISOString(),
        end: new Date(now - 28 * dayMs).toISOString(),
        label: 'same week last month (d-35 to d-28)',
      }
    case 'last_week':
      return {
        start: new Date(now - 14 * dayMs).toISOString(),
        end: new Date(now - 7 * dayMs).toISOString(),
        label: 'last week (7–14 days ago)',
      }
    case 'last_month': {
      const d = new Date()
      const firstOfThisMonth = new Date(d.getFullYear(), d.getMonth(), 1)
      const firstOfLastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1)
      return {
        start: firstOfLastMonth.toISOString(),
        end: firstOfThisMonth.toISOString(),
        label: `last month (${firstOfLastMonth.toISOString().slice(0, 7)})`,
      }
    }
    case 'last_year':
      return {
        start: new Date(now - 372 * dayMs).toISOString(),
        end: new Date(now - 365 * dayMs).toISOString(),
        label: 'same week last year (d-372 to d-365)',
      }
    case 'today': {
      const midnight = new Date()
      midnight.setHours(0, 0, 0, 0)
      return {
        start: midnight.toISOString(),
        end: new Date(now).toISOString(),
        label: 'today (since midnight)',
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
  const d7 = new Date(now - 7 * 86_400_000).toISOString()

  const window = comparisonWindow(comparisonPeriod)

  const [bizResult, current7dResult, compResult] = await Promise.all([
    supabaseAdmin.from('businesses').select('weekly_revenue_target').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId)
      .gte('created_at', d7).neq('status', 'voided'),
    window
      ? supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId)
          .gte('created_at', window.start).lt('created_at', window.end).neq('status', 'voided')
      : Promise.resolve({ data: null, error: null }),
  ])

  const rawTarget = bizResult.data?.weekly_revenue_target
  const weekly_revenue_target = rawTarget ? Number(rawTarget) : null
  if (!weekly_revenue_target) caveats.push("weekly_revenue_target NOT SET — never substitute an average as proxy")

  const current_7d_revenue = (current7dResult.data ?? []).reduce(
    (s: number, r: { total_amount: number | null }) => s + Number(r.total_amount ?? 0), 0,
  )

  let comparison_revenue: number | null = null
  let on_track: 'on_track' | 'behind' | null = null
  let pct_of_target: number | null = null
  let pct_change: string | null = null

  if (window && compResult.data && compResult.data.length > 0) {
    comparison_revenue = (compResult.data as Array<{ total_amount: number | null }>).reduce(
      (s, r) => s + Number(r.total_amount ?? 0), 0,
    )
    if (comparison_revenue > 0) {
      const chg = ((current_7d_revenue - comparison_revenue) / comparison_revenue) * 100
      pct_change = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%'
    }
  } else if (window) {
    caveats.push(`No sales data for comparison window: ${window.label}`)
  }

  if (weekly_revenue_target && weekly_revenue_target > 0) {
    pct_of_target = Math.round((current_7d_revenue / weekly_revenue_target) * 100)
    on_track = current_7d_revenue >= weekly_revenue_target ? 'on_track' : 'behind'
  }

  return {
    detected_comparison_period: comparisonPeriod,
    current_7d_revenue,
    comparison_revenue,
    comparison_window: window?.label ?? null,
    pct_change,
    weekly_revenue_target,
    on_track,
    pct_of_target,
    caveats,
  }
}
