import { supabaseAdmin } from '@/lib/supabase-admin'
import { REPORTABLE_STATUSES } from '@/lib/pos/revenue'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DayData {
  date: string          // YYYY-MM-DD in business timezone
  dayOfWeek: number     // 0=Mon, 6=Sun
  revenue: number
  transactions: number
  avgBasket: number
}

export interface HourlyBucket {
  dayOfWeek: number     // 0=Mon, 6=Sun
  hour: number          // 0-23 in business timezone
  revenue: number
  transactions: number
}

export interface ProductStat {
  productName: string
  quantitySold: number
  revenue: number
  avgUnitPrice: number
}

export interface PaymentBreakdown {
  method: string
  count: number
  total: number
}

export interface ShiftClosure {
  cashierName: string
  shiftStart: string
  shiftEnd: string | null
  openingFloat: number
  closingFloat: number
  expectedCash: number
  varianceCents: number
  totalVoids: number
  totalRefunds: number
}

export interface SuspiciousFlag {
  id: string
  createdAt: string
  totalAmount: number
  paymentMethod: string
  servedBy: string | null
  flagReason: string
  explanation: string
}

export interface WeeklyReportData {
  businessId: string
  weekStart: string           // ISO UTC
  weekEnd: string             // ISO UTC
  timezone: string
  revenueByDay: DayData[]
  hourlyBuckets: HourlyBucket[]
  topProductsByRevenue: ProductStat[]
  topProductsByUnits: ProductStat[]
  paymentMethods: PaymentBreakdown[]
  shiftClosures: ShiftClosure[]
  suspiciousTransactions: SuspiciousFlag[]
  totalRevenue: number
  totalTransactions: number
  avgBasket: number
  priorWeekRevenue: number
  priorWeekTransactions: number
  revenueChangePercent: number | null
  estimatedGrossMarginPercent: number | null
}

type SaleRow = {
  id: string
  created_at: string
  total_amount: number | null
  payment_method: string | null
  status: string | null
  subtotal: number | null
  discount_amount: number | null
  customer_id: string | null
  served_by: string | null
  session_id: string | null
}

// ── Timezone helpers ──────────────────────────────────────────────────────────

function tzDate(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(utcIso))
}

function tzHour(utcIso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz, hour: 'numeric', hour12: false, hourCycle: 'h23',
  }).formatToParts(new Date(utcIso))
  return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0') % 24
}

function tzDow(utcIso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz, weekday: 'short',
  }).formatToParts(new Date(utcIso))
  const day = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  return map[day] ?? 0
}

// Convert a local-timezone date string (YYYY-MM-DD) midnight to UTC.
function localMidnightUtc(dateStr: string, tz: string): Date {
  const utcNoon = new Date(dateStr + 'T12:00:00.000Z')
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz, hour: 'numeric', hour12: false, hourCycle: 'h23',
  }).formatToParts(utcNoon)
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '12') % 24
  return new Date(utcNoon.getTime() - h * 3_600_000)
}

// Compute the most recent Monday 00:00:00 in the given timezone, as UTC.
export function computeWeekStart(timezone: string): Date {
  const now = new Date()
  const todayLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const [y, m, d] = todayLocal.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  const jsDow = base.getUTCDay() // 0=Sun
  const daysToMon = (jsDow + 6) % 7
  base.setUTCDate(base.getUTCDate() - daysToMon)
  return localMidnightUtc(base.toISOString().slice(0, 10), timezone)
}

// ── Main aggregation ──────────────────────────────────────────────────────────

export async function gatherWeeklyData(
  businessId: string,
  weekStart: Date,
  timezone = 'Australia/Melbourne',
): Promise<WeeklyReportData> {
  const weekStartUtc = weekStart.toISOString()
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3_600_000 - 1)
  const weekEndUtc = weekEnd.toISOString()
  const priorStart = new Date(weekStart.getTime() - 7 * 24 * 3_600_000)
  const priorStartUtc = priorStart.toISOString()

  // Parallel batch 1: current-week sales, shifts, prior-week totals, product costs
  // INTEL-COMPUTE-2 — this query is DELIBERATELY unfiltered by status: the suspicious-transaction
  // detection below (VOID_AFTER_HOURS, REFUND_NO_MATCH) needs to see voided/refunded rows, not just
  // completed ones. The bug was every REVENUE aggregation below using `status !== 'voided'` (still
  // admitting draft/refunded) instead of `status === 'completed'` — fixed at each aggregation site,
  // not here, so the fraud-detection rules keep seeing the full row set.
  const [salesRes, shiftsRes, priorRes, productsRes] = await Promise.all([
    supabaseAdmin
      .from('pos_sales')
      .select('id, created_at, total_amount, payment_method, status, subtotal, discount_amount, customer_id, served_by, session_id')
      .eq('business_id', businessId)
      .gte('created_at', weekStartUtc)
      .lte('created_at', weekEndUtc),

    supabaseAdmin
      .from('pos_shift_reports')
      .select('cashier_name, shift_start, shift_end, opening_float, closing_float, expected_cash, variance_cents, total_voids, total_refunds')
      .eq('business_id', businessId)
      .gte('shift_start', weekStartUtc)
      .lte('shift_start', weekEndUtc)
      .order('shift_start'),

    // INTEL-COMPUTE-2 — was neq('voided'), admitting draft/refunded rows into the prior-week
    // comparison baseline. status='completed' matches getRevenueSnapshot()'s canonical rule.
    supabaseAdmin
      .from('pos_sales')
      .select('total_amount')
      .eq('business_id', businessId)
      .in('status', REPORTABLE_STATUSES)
      .gte('created_at', priorStartUtc)
      .lt('created_at', weekStartUtc),

    supabaseAdmin
      .from('pos_products')
      .select('name, cost_price')
      .eq('business_id', businessId)
      .not('cost_price', 'is', null)
      .gt('cost_price', 0),
  ])

  const sales: SaleRow[] = (salesRes.data ?? []) as SaleRow[]

  // pos_sale_items has NO business_id — must join through pos_sales via sale_id.
  // INTEL-COMPUTE-2 — was `!== 'voided'` (admitted draft/refunded line items into top-products
  // revenue/COGS below); `=== 'completed'` is the canonical filter.
  const saleIds = sales.filter(s => s.status === 'completed').map(s => s.id)

  const { data: itemsRaw } = saleIds.length > 0
    ? await supabaseAdmin
        .from('pos_sale_items')
        .select('sale_id, product_name, quantity, unit_price, line_total')
        .in('sale_id', saleIds)
    : { data: [] as Array<{ sale_id: string; product_name: string | null; quantity: number; unit_price: number; line_total: number }> }

  const items = itemsRaw ?? []

  // ── 1. Revenue by day ─────────────────────────────────────────────────────
  const dayMap = new Map<string, { revenue: number; count: number }>()
  for (const s of sales) {
    if (s.status !== 'completed') continue // INTEL-COMPUTE-2 — was `=== 'voided'` (still admitted draft/refunded)
    const d = tzDate(s.created_at, timezone)
    const cur = dayMap.get(d) ?? { revenue: 0, count: 0 }
    cur.revenue += Number(s.total_amount) || 0
    cur.count++
    dayMap.set(d, cur)
  }
  const revenueByDay: DayData[] = []
  for (let i = 0; i < 7; i++) {
    const dt = new Date(weekStart.getTime() + i * 24 * 3_600_000)
    const dateStr = tzDate(dt.toISOString(), timezone)
    const v = dayMap.get(dateStr) ?? { revenue: 0, count: 0 }
    revenueByDay.push({
      date: dateStr,
      dayOfWeek: i,
      revenue: v.revenue,
      transactions: v.count,
      avgBasket: v.count > 0 ? v.revenue / v.count : 0,
    })
  }

  // ── 2. Hourly buckets ─────────────────────────────────────────────────────
  const hourMap = new Map<string, { revenue: number; count: number }>()
  for (const s of sales) {
    if (s.status !== 'completed') continue // INTEL-COMPUTE-2 — was `=== 'voided'` (still admitted draft/refunded)
    const key = `${tzDow(s.created_at, timezone)}-${tzHour(s.created_at, timezone)}`
    const cur = hourMap.get(key) ?? { revenue: 0, count: 0 }
    cur.revenue += Number(s.total_amount) || 0
    cur.count++
    hourMap.set(key, cur)
  }
  const hourlyBuckets: HourlyBucket[] = Array.from(hourMap.entries()).map(([k, v]) => {
    const [dow, h] = k.split('-').map(Number)
    return { dayOfWeek: dow, hour: h, revenue: v.revenue, transactions: v.count }
  })

  // ── 3. Top products ───────────────────────────────────────────────────────
  const productMap = new Map<string, { qty: number; revenue: number }>()
  for (const item of items) {
    const name = item.product_name ?? 'Unknown'
    const cur = productMap.get(name) ?? { qty: 0, revenue: 0 }
    cur.qty += Number(item.quantity) || 0
    cur.revenue += Number(item.line_total) || 0
    productMap.set(name, cur)
  }
  const allProducts = Array.from(productMap.entries()).map(([name, v]) => ({
    productName: name,
    quantitySold: v.qty,
    revenue: v.revenue,
    avgUnitPrice: v.qty > 0 ? v.revenue / v.qty : 0,
  }))
  const topProductsByRevenue = [...allProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  const topProductsByUnits = [...allProducts].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 10)

  // ── 4. Payment methods ────────────────────────────────────────────────────
  const pmMap = new Map<string, { count: number; total: number }>()
  for (const s of sales) {
    if (s.status !== 'completed') continue // INTEL-COMPUTE-2 — was `=== 'voided'` (still admitted draft/refunded)
    const method = (s.payment_method ?? 'unknown').toLowerCase()
    const cur = pmMap.get(method) ?? { count: 0, total: 0 }
    cur.count++
    cur.total += Number(s.total_amount) || 0
    pmMap.set(method, cur)
  }
  const paymentMethods: PaymentBreakdown[] = Array.from(pmMap.entries())
    .map(([method, v]) => ({ method, count: v.count, total: v.total }))
    .sort((a, b) => b.total - a.total)

  // ── 5. Shift closures ─────────────────────────────────────────────────────
  const shiftClosures: ShiftClosure[] = (shiftsRes.data ?? []).map(r => ({
    cashierName: r.cashier_name ?? '',
    shiftStart: r.shift_start ?? '',
    shiftEnd: r.shift_end ?? null,
    openingFloat: Number(r.opening_float) || 0,
    closingFloat: Number(r.closing_float) || 0,
    expectedCash: Number(r.expected_cash) || 0,
    varianceCents: Number(r.variance_cents) || 0,
    totalVoids: Number(r.total_voids) || 0,
    totalRefunds: Number(r.total_refunds) || 0,
  }))

  // ── 6. Suspicious transactions (deterministic rules, no AI) ───────────────
  const sessionMap = new Map<string, SaleRow[]>()
  for (const s of sales) {
    if (!s.session_id) continue
    const arr = sessionMap.get(s.session_id) ?? []
    arr.push(s)
    sessionMap.set(s.session_id, arr)
  }

  const suspicious: SuspiciousFlag[] = []
  const flagged = new Set<string>()

  const addFlag = (s: SaleRow, reason: string, explanation: string) => {
    const key = `${s.id}:${reason}`
    if (flagged.has(key)) return
    flagged.add(key)
    suspicious.push({
      id: s.id,
      createdAt: s.created_at,
      totalAmount: Number(s.total_amount) || 0,
      paymentMethod: s.payment_method ?? 'unknown',
      servedBy: s.served_by ?? null,
      flagReason: reason,
      explanation,
    })
  }

  for (const s of sales) {
    const h = tzHour(s.created_at, timezone)
    const total = Number(s.total_amount) || 0
    const sub = Number(s.subtotal) || 0
    const disc = Number(s.discount_amount) || 0

    // a. VOID_AFTER_HOURS: voided outside 07:00–23:00 local
    if (s.status === 'voided' && (h < 7 || h > 23)) {
      addFlag(s, 'VOID_AFTER_HOURS', `Sale voided at ${h}:00 local time, outside the 07:00–23:00 operating window.`)
    }
    // b. LARGE_DISCOUNT: discount > 30% of subtotal
    if (s.status !== 'voided' && sub > 0 && disc / sub > 0.30) {
      addFlag(s, 'LARGE_DISCOUNT', `${((disc / sub) * 100).toFixed(0)}% discount applied (threshold: 30%).`)
    }
    // c. HIGH_VALUE_CASH: cash payment over $200
    if (s.status !== 'voided' && (s.payment_method ?? '').toLowerCase() === 'cash' && total > 200) {
      addFlag(s, 'HIGH_VALUE_CASH', `Cash payment of $${total.toFixed(2)} exceeds $200 threshold.`)
    }
    // d. NO_CUSTOMER_HIGH_VALUE: no linked customer, total > $150
    if (s.status !== 'voided' && !s.customer_id && total > 150) {
      addFlag(s, 'NO_CUSTOMER_HIGH_VALUE', `$${total.toFixed(2)} sale processed without a linked customer record.`)
    }
    // e. UNUSUAL_HOUR: non-voided sale before 06:00 or after 23:00
    if (s.status !== 'voided' && (h < 6 || h > 23)) {
      addFlag(s, 'UNUSUAL_HOUR', `Sale processed at ${h}:00 local time, outside normal operating hours (06:00–23:00).`)
    }
    // f. REFUND_NO_MATCH: refund with no matching completed sale in same session
    if (s.status === 'refunded') {
      const sessionSales = s.session_id ? (sessionMap.get(s.session_id) ?? []) : []
      const hasMatch = sessionSales.some(o => o.id !== s.id && o.status !== 'refunded' && o.status !== 'voided')
      if (!hasMatch) {
        addFlag(s, 'REFUND_NO_MATCH', `Refunded sale has no matching completed sale in the same session.`)
      }
    }
  }

  // ── 7. Prior week comparison ──────────────────────────────────────────────
  const priorWeekRevenue = (priorRes.data ?? []).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  const priorWeekTransactions = (priorRes.data ?? []).length

  // ── 8. COGS estimate ──────────────────────────────────────────────────────
  const costMap = new Map<string, number>()
  for (const p of productsRes.data ?? []) {
    if (p.cost_price != null) costMap.set((p.name ?? '').toLowerCase(), Number(p.cost_price))
  }
  let coveredRev = 0, uncoveredRev = 0, totalCost = 0
  for (const item of items) {
    const cost = costMap.get((item.product_name ?? '').toLowerCase())
    const rev = Number(item.line_total) || 0
    if (cost !== undefined) {
      coveredRev += rev
      totalCost += cost * (Number(item.quantity) || 0)
    } else {
      uncoveredRev += rev
    }
  }
  const coverage = (coveredRev + uncoveredRev) > 0 ? coveredRev / (coveredRev + uncoveredRev) : 0
  const estimatedGrossMarginPercent = coverage > 0.5 && coveredRev > 0
    ? ((coveredRev - totalCost) / coveredRev) * 100
    : null

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalRevenue = revenueByDay.reduce((s, d) => s + d.revenue, 0)
  const totalTransactions = revenueByDay.reduce((s, d) => s + d.transactions, 0)
  const avgBasket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
  const revenueChangePercent = priorWeekRevenue > 0
    ? ((totalRevenue - priorWeekRevenue) / priorWeekRevenue) * 100
    : null

  return {
    businessId,
    weekStart: weekStartUtc,
    weekEnd: weekEndUtc,
    timezone,
    revenueByDay,
    hourlyBuckets,
    topProductsByRevenue,
    topProductsByUnits,
    paymentMethods,
    shiftClosures,
    suspiciousTransactions: suspicious,
    totalRevenue,
    totalTransactions,
    avgBasket,
    priorWeekRevenue,
    priorWeekTransactions,
    revenueChangePercent,
    estimatedGrossMarginPercent,
  }
}
