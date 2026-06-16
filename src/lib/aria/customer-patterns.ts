import { supabaseAdmin } from '@/lib/supabase-admin'
import { getOrRefreshSignalPattern } from '@/lib/aria/owner-patterns'

// AM-2 — CUSTOMER-BASE visit/purchase patterns from POS (pos_sales completed + pos_customers). The
// ABSOLUTE baseline profile of the café's visitors: peak visit times, repeat rate, avg basket,
// new-vs-returning split, visit frequency. Distinct from:
//   • AM-1 owner_pattern (the OWNER's app behaviour, not customers)
//   • signal-engine.ts signals, which are TREND/ANOMALY deltas (avg_basket_trend = WoW %,
//     "new_vs_returning" = loyalty-capture rate, day_of_week_pattern = revenue anomalies) — AM-2 is
//     the standing baseline, a different signal_type with different metrics.
//   • per-customer segmentation (segment label) — AM-2 is aggregate, not per-customer.
// Pure SQL aggregation — no AI, no invented numbers.

const MIN_SALES = 30           // RULE 5: too few completed sales = no confident visit pattern
const MIN_CUSTOMERS = 10       // RULE 5: too few customers = no confident base profile
const WINDOW_DAYS = 90
const TTL_MS = 24 * 3600 * 1000
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface CustomerPattern {
  available: boolean
  reason?: string
  window_days: number
  total_sales: number
  total_customers: number
  peak_visit_daypart: string
  peak_visit_hours: string[]
  busiest_day: string | null
  avg_basket: number
  repeat_rate_pct: number       // share of customers who have visited more than once
  returning_customers: number
  new_customers: number
  avg_visit_frequency: number   // mean visit_count across the customer base
  reasoning: string
  computed_at: string
}

// PostgREST caps a single response at ~1000 rows regardless of .limit(); page through with .range()
// so absolute figures (count, avg basket) are exact and match a direct SQL aggregate.
async function fetchAllPaged<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, cap = 50000): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; from < cap; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

function aestHour(iso: string): number { return new Date(new Date(iso).getTime() + 10 * 3600000).getUTCHours() }
function aestDow(iso: string): number { return new Date(new Date(iso).getTime() + 10 * 3600000).getUTCDay() }
function hourLabel(h: number): string { return (h % 12 || 12) + (h < 12 ? 'am' : 'pm') }
function daypart(h: number): string { return h < 6 ? 'overnight' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening' }
const r2 = (n: number) => Math.round(n * 100) / 100

export async function computeCustomerPatterns(businessId: string): Promise<CustomerPattern> {
  const now = new Date().toISOString()
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()

  const [sales, customers] = await Promise.all([
    // visit/purchase behaviour — completed sales only (a sale = a visit), DOLLARS. Paged → exact.
    fetchAllPaged<{ total_amount: number | null; created_at: string | null }>((from, to) =>
      supabaseAdmin.from('pos_sales')
        .select('total_amount, created_at')
        .eq('business_id', businessId).eq('status', 'completed')
        .gte('created_at', since).order('created_at', { ascending: false }).range(from, to)),
    // customer base — visit_count drives repeat rate + frequency + new-vs-returning split. Paged → exact.
    fetchAllPaged<{ visit_count: number | null }>((from, to) =>
      supabaseAdmin.from('pos_customers')
        .select('visit_count')
        .eq('business_id', businessId).is('deleted_at', null).order('created_at', { ascending: false }).range(from, to)),
  ])

  const totalSales = sales.length
  const totalCustomers = customers.length

  const empty = (reason: string): CustomerPattern => ({
    available: false, reason, window_days: WINDOW_DAYS, total_sales: totalSales, total_customers: totalCustomers,
    peak_visit_daypart: '', peak_visit_hours: [], busiest_day: null, avg_basket: 0,
    repeat_rate_pct: 0, returning_customers: 0, new_customers: 0, avg_visit_frequency: 0,
    reasoning: 'Insufficient POS history for a confident customer-base pattern.', computed_at: now,
  })
  if (totalSales < MIN_SALES) return empty(`Only ${totalSales} completed sales in the last ${WINDOW_DAYS} days — too few to infer a visit pattern.`)
  if (totalCustomers < MIN_CUSTOMERS) return empty(`Only ${totalCustomers} customers on record — too few for a reliable customer-base profile.`)

  // Visit-time distribution (AEST), busiest day, avg basket
  const hourCounts = new Array(24).fill(0) as number[]
  const dowCounts = new Array(7).fill(0) as number[]
  const dpCounts: Record<string, number> = {}
  let revenue = 0
  for (const s of sales) {
    if (!s.created_at) continue
    const h = aestHour(s.created_at)
    hourCounts[h]++
    dpCounts[daypart(h)] = (dpCounts[daypart(h)] ?? 0) + 1
    dowCounts[aestDow(s.created_at)]++
    revenue += Number(s.total_amount ?? 0)
  }
  const peak_visit_hours = hourCounts.map((count, h) => ({ hour: hourLabel(h), count })).filter(x => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 3).map(x => x.hour)
  const peak_visit_daypart = Object.entries(dpCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const busiestDow = dowCounts.map((c, i) => ({ i, c })).sort((a, b) => b.c - a.c)[0]
  const busiest_day = busiestDow && busiestDow.c > 0 ? DOW[busiestDow.i] : null
  const avg_basket = r2(revenue / totalSales)

  // Repeat / new-vs-returning / frequency from visit_count
  const visits = customers.map(c => Number(c.visit_count ?? 0))
  const returning_customers = visits.filter(v => v > 1).length
  const new_customers = totalCustomers - returning_customers
  const repeat_rate_pct = r2((returning_customers / totalCustomers) * 100)
  const avg_visit_frequency = r2(visits.reduce((s, v) => s + v, 0) / totalCustomers)

  const reasoning = `Customers visit most in the ${peak_visit_daypart} (peak around ${peak_visit_hours.join(', ')})`
    + `${busiest_day ? `, busiest on ${busiest_day}` : ''}; average basket ${'$' + avg_basket.toFixed(2)}.`
    + ` ${repeat_rate_pct}% are repeat customers (${returning_customers} returning vs ${new_customers} new),`
    + ` averaging ${avg_visit_frequency} visits each.`
    + ` Based on ${totalSales} completed sales and ${totalCustomers} customers — cite these; never invent customer figures.`

  return {
    available: true, window_days: WINDOW_DAYS, total_sales: totalSales, total_customers: totalCustomers,
    peak_visit_daypart, peak_visit_hours, busiest_day, avg_basket,
    repeat_rate_pct, returning_customers, new_customers, avg_visit_frequency, reasoning, computed_at: now,
  }
}

// Cache-first customer pattern (aria_signal_cache 'customer_pattern', 24h TTL), via the shared helper.
export async function getOrRefreshCustomerPattern(businessId: string): Promise<CustomerPattern | null> {
  return getOrRefreshSignalPattern(businessId, 'customer_pattern', TTL_MS, computeCustomerPatterns)
}
