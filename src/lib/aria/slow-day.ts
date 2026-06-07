/**
 * Canonical slow-day computation — single source imported by ALL surfaces.
 * Registry definition: schema-registry.ts slow_day domain.
 *
 * Method: SUM(pos_sales.total_amount) per distinct UTC calendar date →
 *         average of those daily totals per day-of-week → rank ascending.
 * Window: last 28 days (4 of each weekday, clean + recent).
 * Source: pos_sales.total_amount, neq('status','voided'), limit(3000).
 * DOW:    UTC — date keys sliced as 'YYYY-MM-DD', parsed as T00:00:00Z.
 * Threshold: ≥3 distinct calendar days per DOW (28-day window always satisfies this).
 *
 * Verified ground truth (ff5055a0, 28-day window): Tuesday = $392.02/day.
 * Cross-checked to the cent against direct SQL aggregation.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'

export const SLOW_DAY_WINDOW_DAYS = 28
export const SLOW_DAY_MIN_CALENDAR_DAYS = 3

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export interface DowStats {
  dow: number         // 0–6 (UTC day-of-week, 0 = Sunday)
  name: string        // 'Sunday' … 'Saturday'
  avgRev: number      // average daily revenue in AUD (pos_sales.total_amount basis)
  calendarDays: number // distinct calendar days for this DOW in the window
}

export interface SlowDayResult {
  slowest: DowStats           // DOW with the lowest avgRev (the slow day)
  all: DowStats[]             // all qualifying DOWs, sorted ascending by avgRev
  overallDailyAvg: number     // grand average across all distinct calendar days
}

/**
 * Compute the slowest day for a business using the registry canonical method.
 * Returns null when there is insufficient data (< 10 sales or no qualifying DOWs).
 */
export async function computeSlowDay(business_id: string): Promise<SlowDayResult | null> {
  const since = new Date(Date.now() - SLOW_DAY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('created_at,total_amount')
    .eq('business_id', business_id)
    .neq('status', 'voided')
    .gte('created_at', since)
    .limit(3000)

  if (!sales || sales.length < 10) return null

  // Step 1: bucket by UTC calendar date (slice(0,10) gives 'YYYY-MM-DD' in UTC)
  const dailyRevenue: Record<string, number> = {}
  for (const sale of sales) {
    const dateKey = (sale.created_at as string).slice(0, 10)
    dailyRevenue[dateKey] = (dailyRevenue[dateKey] ?? 0) + Number(sale.total_amount ?? 0)
  }

  // Step 2: group daily totals by UTC DOW
  // Parse as UTC midnight so DOW is consistent regardless of server timezone.
  const dowBuckets: Record<number, { total: number; days: number }> = {}
  for (const [dateStr, rev] of Object.entries(dailyRevenue)) {
    const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay()
    const b = dowBuckets[dow] ?? { total: 0, days: 0 }
    b.total += rev
    b.days++
    dowBuckets[dow] = b
  }

  if (Object.keys(dowBuckets).length < 3) return null

  // Step 3: rank ascending; require ≥ SLOW_DAY_MIN_CALENDAR_DAYS per DOW
  const qualifying = Object.entries(dowBuckets)
    .filter(([, d]) => d.days >= SLOW_DAY_MIN_CALENDAR_DAYS)
    .map(([dow, d]): DowStats => ({
      dow: Number(dow),
      name: DOW_NAMES[Number(dow)],
      avgRev: d.total / d.days,
      calendarDays: d.days,
    }))
    .sort((a, b) => a.avgRev - b.avgRev)

  if (qualifying.length === 0) return null

  const totalRev = Object.values(dowBuckets).reduce((s, d) => s + d.total, 0)
  const totalDays = Object.values(dowBuckets).reduce((s, d) => s + d.days, 0)

  return {
    slowest: qualifying[0],
    all: qualifying,
    overallDailyAvg: totalDays > 0 ? totalRev / totalDays : 0,
  }
}
