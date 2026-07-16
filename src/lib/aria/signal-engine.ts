import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveCostBatch } from '@/lib/inventory/resolve-cost'
import { toAESTWallClock } from '@/lib/date-au'

export type Signal = {
  signal_type: string
  payload: Record<string, unknown>
  severity: 'info' | 'watch' | 'alert' | 'critical'
  expires_in_min: number
}

function safe<T>(p: Promise<T>): Promise<T | null> {
  return p.catch(() => null)
}

function sumAmount(rows: Array<{ total_amount?: number | null }> | null): number {
  return (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
}

export async function computeAllSignalsForBusiness(businessId: string): Promise<Signal[]> {
  const { data: trackingData } = await supabaseAdmin
    .from('aria_tracking_preferences').select('category,is_tracking').eq('business_id', businessId)
  const enabled = new Set((trackingData ?? []).filter(t => t.is_tracking).map(t => t.category as string))
  const all = new Set(['cashflow', 'inventory', 'customers', 'sales', 'staff', 'compliance', 'expiry'])
  const active = enabled.size > 0 ? enabled : all

  const tasks: Promise<Signal[]>[] = []
  if (active.has('cashflow'))  tasks.push(cashflowSignals(businessId))
  if (active.has('inventory')) tasks.push(inventorySignals(businessId))
  if (active.has('customers')) tasks.push(customerSignals(businessId))
  if (active.has('sales'))     tasks.push(salesSignals(businessId))
  if (active.has('staff'))     tasks.push(staffSignals(businessId))
  if (active.has('compliance') || active.has('expiry')) tasks.push(complianceSignals(businessId))

  const results = await Promise.allSettled(tasks)
  const signals: Signal[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') signals.push(...r.value)
  }
  return signals
}

// ─── CASHFLOW ─────────────────────────────────────────────────────────────

async function cashflowSignals(businessId: string): Promise<Signal[]> {
  const signals: Signal[] = []
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  // revenue_velocity_24h
  // INTEL-COMPUTE-4 — every query in this function used neq('voided'), admitting draft/refunded
  // rows. status='completed' matches getRevenueSnapshot()'s canonical rule.
  try {
    const [r24, hist] = await Promise.all([
      supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 24*3600*1000)),
      supabaseAdmin.from('pos_sales').select('total_amount,created_at').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 15*24*3600*1000)).lt('created_at', iso(now - 24*3600*1000)),
    ])
    const rev24 = sumAmount(r24.data)
    const txn24 = (r24.data ?? []).length
    const daily: Record<string, number> = {}
    for (const r of hist.data ?? []) { const d = r.created_at.slice(0, 10); daily[d] = (daily[d] ?? 0) + Number(r.total_amount ?? 0) }
    const vals = Object.values(daily)
    if (vals.length >= 3) {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length
      const stddev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length)
      const z = stddev > 0 ? (rev24 - mean) / stddev : 0
      signals.push({ signal_type: 'revenue_velocity_24h', payload: { revenue_24h: rev24, baseline_avg: mean, baseline_stddev: stddev, z_score: z, percent_change: mean > 0 ? ((rev24 - mean) / mean) * 100 : 0, transactions_24h: txn24 }, severity: Math.abs(z) > 2.5 ? 'alert' : Math.abs(z) > 1.5 ? 'watch' : 'info', expires_in_min: 30 })
    }
  } catch { /* defensive */ }

  // revenue_velocity_7d
  try {
    const [w1, w2] = await Promise.all([
      supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 7*24*3600*1000)),
      supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 14*24*3600*1000)).lt('created_at', iso(now - 7*24*3600*1000)),
    ])
    const r7 = sumAmount(w1.data), r14 = sumAmount(w2.data)
    const pct = r14 > 0 ? ((r7 - r14) / r14) * 100 : 0
    signals.push({ signal_type: 'revenue_velocity_7d', payload: { revenue_7d: r7, revenue_prior_7d: r14, percent_change: pct }, severity: Math.abs(pct) > 25 ? 'alert' : Math.abs(pct) > 10 ? 'watch' : 'info', expires_in_min: 60 })
  } catch { /* defensive */ }

  // payment_method_drift
  try {
    const [wk, bl] = await Promise.all([
      supabaseAdmin.from('pos_sales').select('payment_method').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 7*24*3600*1000)),
      supabaseAdmin.from('pos_sales').select('payment_method').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 14*24*3600*1000)).lt('created_at', iso(now - 7*24*3600*1000)),
    ])
    const countMethod = (rows: Array<{ payment_method?: string | null }> | null) => {
      const c: Record<string, number> = {}
      for (const r of rows ?? []) { const m = r.payment_method ?? 'unknown'; c[m] = (c[m] ?? 0) + 1 }
      return c
    }
    const wkC = countMethod(wk.data), blC = countMethod(bl.data)
    const wkT = Object.values(wkC).reduce((s, v) => s + v, 0)
    const blT = Object.values(blC).reduce((s, v) => s + v, 0)
    if (wkT > 0) {
      signals.push({ signal_type: 'payment_method_drift', payload: { this_week: Object.fromEntries(Object.entries(wkC).map(([k, v]) => [k, v / wkT])), baseline: Object.fromEntries(Object.entries(blC).map(([k, v]) => [k, v / (blT || 1)])), total_transactions: wkT }, severity: 'info', expires_in_min: 120 })
    }
  } catch { /* defensive */ }

  return signals
}

// ─── INVENTORY ────────────────────────────────────────────────────────────

async function inventorySignals(businessId: string): Promise<Signal[]> {
  const signals: Signal[] = []
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  // stock_burn_rate
  try {
    const { data: prods } = await supabaseAdmin.from('pos_products').select('id,name,stock_quantity,low_stock_threshold').eq('business_id', businessId).eq('is_active', true).eq('track_stock', true).gt('stock_quantity', 0).limit(50)
    if (prods?.length) {
      const { data: items } = await supabaseAdmin.from('pos_sale_items').select('product_id,quantity,created_at').eq('business_id', businessId).gte('created_at', iso(now - 14*24*3600*1000)).in('product_id', prods.map(p => p.id))
      const dailySales: Record<string, number> = {}
      for (const i of items ?? []) { dailySales[i.product_id] = (dailySales[i.product_id] ?? 0) + Number(i.quantity ?? 1) }
      const atRisk = prods.map(p => {
        const avgDaily = (dailySales[p.id] ?? 0) / 14
        const days = avgDaily > 0 ? p.stock_quantity / avgDaily : Infinity
        return { name: p.name, stock_quantity: p.stock_quantity, avg_daily_sales: avgDaily, days_until_stockout: days < Infinity ? Math.round(days * 10) / 10 : null, recommended_reorder_qty: Math.ceil(avgDaily * 14) }
      }).filter(p => p.days_until_stockout !== null && p.days_until_stockout < 7)
      const critical = atRisk.filter(p => (p.days_until_stockout ?? 99) < 3).length
      const warning = atRisk.filter(p => { const d = p.days_until_stockout ?? 99; return d >= 3 && d < 7 }).length
      if (atRisk.length) signals.push({ signal_type: 'stock_burn_rate', payload: { products_at_risk: atRisk.slice(0, 10), count_critical: critical, count_warning: warning }, severity: critical > 0 ? 'critical' : warning > 0 ? 'alert' : 'watch', expires_in_min: 60 })
    }
  } catch { /* defensive */ }

  // dead_stock
  try {
    const { data: allProds } = await supabaseAdmin.from('pos_products').select('id,name,stock_quantity').eq('business_id', businessId).eq('is_active', true).gt('stock_quantity', 0)
    if (allProds?.length) {
      const { data: recentItems } = await supabaseAdmin.from('pos_sale_items').select('product_id').eq('business_id', businessId).gte('created_at', iso(now - 30*24*3600*1000))
      const active = new Set((recentItems ?? []).map(i => i.product_id))
      const dead = allProds.filter(p => !active.has(p.id)).slice(0, 20)
      if (dead.length) signals.push({ signal_type: 'dead_stock', payload: { dead_products: dead.map(p => ({ name: p.name, stock_quantity: p.stock_quantity })), count: dead.length }, severity: dead.length > 5 ? 'alert' : 'watch', expires_in_min: 360 })
    }
  } catch { /* defensive */ }

  // price_margin_health
  // INTEL-COMPUTE-2 — was reading pos_products.cost (a live column that is 0/unset for every
  // product in the entire database, confirmed live — every margin site elsewhere in this codebase
  // reads cost_price, or resolves cost via resolveCost()'s outlet/PO/catalogue chain). The `cost > 0`
  // gate then unconditionally excluded every product, so this signal could never fire for ANY
  // tenant regardless of real margin health. Now resolves cost via the canonical resolveCostBatch(),
  // matching every other margin site.
  try {
    const [{ data: prods }, costMap] = await Promise.all([
      supabaseAdmin.from('pos_products').select('id,name,price').eq('business_id', businessId).eq('is_active', true).not('price', 'is', null),
      resolveCostBatch(supabaseAdmin, businessId, null),
    ])
    const lowMargin = (prods ?? [])
      .map(p => ({ name: p.name, price: Number(p.price) || 0, cost: costMap.get(p.id)?.cost ?? null }))
      .filter(p => p.price > 0 && p.cost != null && p.cost > 0 && (p.price - p.cost) / p.price < 0.2)
      .map(p => ({ name: p.name, price: p.price, cost: p.cost, margin_pct: Math.round(((p.price - (p.cost as number)) / p.price) * 1000) / 10 }))
      .slice(0, 10)
    if (lowMargin.length) signals.push({ signal_type: 'price_margin_health', payload: { low_margin_products: lowMargin, count: lowMargin.length }, severity: lowMargin.length > 3 ? 'alert' : 'watch', expires_in_min: 360 })
  } catch { /* defensive */ }

  return signals
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────

async function customerSignals(businessId: string): Promise<Signal[]> {
  const signals: Signal[] = []
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  // churn_velocity
  try {
    const [at_risk, total] = await Promise.all([
      supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).lt('last_visit', iso(now - 30*24*3600*1000)).gte('last_visit', iso(now - 60*24*3600*1000)),
      supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    ])
    const atRiskCount = at_risk.count ?? 0
    const totalCount = total.count ?? 0
    if (totalCount > 0) {
      const pct = (atRiskCount / totalCount) * 100
      signals.push({ signal_type: 'churn_velocity', payload: { at_risk_count: atRiskCount, total_customers: totalCount, churn_pct: pct }, severity: pct > 30 ? 'alert' : pct > 15 ? 'watch' : 'info', expires_in_min: 120 })
    }
  } catch { /* defensive */ }

  // avg_basket_trend
  // INTEL-COMPUTE-4 — was neq('voided'), admitting draft/refunded rows.
  try {
    const [wk, bl] = await Promise.all([
      supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 7*24*3600*1000)),
      supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 14*24*3600*1000)).lt('created_at', iso(now - 7*24*3600*1000)),
    ])
    const wkAvg = (wk.data ?? []).length > 0 ? sumAmount(wk.data) / (wk.data ?? []).length : 0
    const blAvg = (bl.data ?? []).length > 0 ? sumAmount(bl.data) / (bl.data ?? []).length : 0
    const pct = blAvg > 0 ? ((wkAvg - blAvg) / blAvg) * 100 : 0
    if (wkAvg > 0) signals.push({ signal_type: 'avg_basket_trend', payload: { avg_basket_this_week: wkAvg, avg_basket_baseline: blAvg, percent_change: pct }, severity: Math.abs(pct) > 20 ? 'watch' : 'info', expires_in_min: 120 })
  } catch { /* defensive */ }

  // new_vs_returning (approx: sales with vs without customer_id)
  // INTEL-COMPUTE-4 — was neq('voided'), admitting draft/refunded rows.
  try {
    const { data: sales } = await supabaseAdmin.from('pos_sales').select('customer_id').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 7*24*3600*1000))
    const total = (sales ?? []).length
    const withCustomer = (sales ?? []).filter(s => s.customer_id).length
    if (total > 0) signals.push({ signal_type: 'new_vs_returning', payload: { total_sales: total, linked_to_customer: withCustomer, loyalty_capture_rate: Math.round((withCustomer / total) * 100) }, severity: withCustomer / total < 0.2 ? 'watch' : 'info', expires_in_min: 120 })
  } catch { /* defensive */ }

  return signals
}

// ─── SALES ────────────────────────────────────────────────────────────────

async function salesSignals(businessId: string): Promise<Signal[]> {
  const signals: Signal[] = []
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  // day_of_week_pattern
  // INTEL-COMPUTE-4 — was neq('voided') (admitted draft/refunded rows) and new Date().getDay()
  // (server-local/UTC day-of-week), misattributing AEST-morning sales to the wrong day.
  try {
    const [thisWeek, prior4] = await Promise.all([
      supabaseAdmin.from('pos_sales').select('total_amount,created_at').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 7*24*3600*1000)),
      supabaseAdmin.from('pos_sales').select('total_amount,created_at').eq('business_id', businessId).eq('status','completed').gte('created_at', iso(now - 35*24*3600*1000)).lt('created_at', iso(now - 7*24*3600*1000)),
    ])
    const byDay = (rows: Array<{ total_amount?: number | null; created_at: string }> | null) => {
      const d: Record<number, number> = {}
      for (const r of rows ?? []) { const dow = toAESTWallClock(r.created_at).getUTCDay(); d[dow] = (d[dow] ?? 0) + Number(r.total_amount ?? 0) }
      return d
    }
    const wkDay = byDay(thisWeek.data), prDay = byDay(prior4.data)
    const anomalies: Array<{ day: number; this_week: number; baseline: number; deviation_pct: number }> = []
    for (let d = 0; d < 7; d++) {
      const base = (prDay[d] ?? 0) / 4
      if (base > 0 && wkDay[d] != null) {
        const dev = Math.abs(((wkDay[d] - base) / base) * 100)
        if (dev > 25) anomalies.push({ day: d, this_week: wkDay[d], baseline: base, deviation_pct: dev })
      }
    }
    if (anomalies.length) signals.push({ signal_type: 'day_of_week_pattern', payload: { anomalies, by_day_this_week: wkDay }, severity: anomalies.length > 2 ? 'alert' : 'watch', expires_in_min: 120 })
  } catch { /* defensive */ }

  // top_product_growth
  // INTEL-COMPUTE-4 — two bugs: (1) no status join at all — pos_sale_items has no status column of
  // its own, so draft/voided/refunded sale items were all included with zero way to exclude them;
  // (2) `base > 0 ? ... : 100` fabricated a flat "100% growth" whenever there was no prior-period
  // baseline (confirmed firing live on real data — a product selling for the first time in 7 years
  // reports a specific, invented 100% growth figure instead of "no baseline to compare against").
  try {
    const [wk, bl] = await Promise.all([
      supabaseAdmin.from('pos_sale_items').select('product_name,quantity,pos_sales!inner(status)').eq('business_id', businessId).eq('pos_sales.status', 'completed').gte('created_at', iso(now - 7*24*3600*1000)).limit(500),
      supabaseAdmin.from('pos_sale_items').select('product_name,quantity,pos_sales!inner(status)').eq('business_id', businessId).eq('pos_sales.status', 'completed').gte('created_at', iso(now - 14*24*3600*1000)).lt('created_at', iso(now - 7*24*3600*1000)).limit(500),
    ])
    const agg = (rows: Array<{ product_name?: string | null; quantity?: number | null }> | null) => {
      const m: Record<string, number> = {}
      for (const r of rows ?? []) { const n = r.product_name ?? 'Unknown'; m[n] = (m[n] ?? 0) + Number(r.quantity ?? 1) }
      return m
    }
    const wkAgg = agg(wk.data), blAgg = agg(bl.data)
    const growth = Object.entries(wkAgg).map(([name, qty]) => {
      const base = blAgg[name] ?? 0
      const pct = base > 0 ? ((qty - base) / base) * 100 : null
      return { name, qty_this_week: qty, qty_prior_week: base, growth_pct: pct, insufficient_baseline: base === 0 }
    }).sort((a, b) => {
      // Real percentage-growth items rank first (descending); no-baseline items (nothing to
      // compare against) sort to the end rather than being falsely treated as "infinite growth".
      if (a.growth_pct == null && b.growth_pct == null) return 0
      if (a.growth_pct == null) return 1
      if (b.growth_pct == null) return -1
      return b.growth_pct - a.growth_pct
    }).slice(0, 5)
    if (growth.length) signals.push({ signal_type: 'top_product_growth', payload: { top_growers: growth }, severity: 'info', expires_in_min: 120 })
  } catch { /* defensive */ }

  return signals
}

// ─── STAFF ────────────────────────────────────────────────────────────────

async function staffSignals(businessId: string): Promise<Signal[]> {
  const signals: Signal[] = []
  const now = new Date()

  // visa_expiry_window
  try {
    const { data: staff } = await supabaseAdmin.from('staff_members').select('first_name,last_name,position,visa_expiry_date').eq('business_id', businessId).eq('status','active').not('visa_expiry_date','is', null)
    const ninety = new Date(now.getTime() + 90*24*3600*1000).toISOString().slice(0, 10)
    const expiring = (staff ?? []).filter(s => s.visa_expiry_date <= ninety).map(s => {
      const days = Math.ceil((new Date(s.visa_expiry_date).getTime() - now.getTime()) / 86400000)
      return { name: `${s.first_name} ${s.last_name}`, position: s.position, visa_expiry_date: s.visa_expiry_date, days_remaining: days, band: days < 30 ? 'red' : days < 60 ? 'amber' : 'yellow' }
    })
    if (expiring.length) {
      const red = expiring.filter(e => e.band === 'red').length
      signals.push({ signal_type: 'visa_expiry_window', payload: { expiring_staff: expiring, count_red: red, count_amber: expiring.filter(e => e.band === 'amber').length, count_yellow: expiring.filter(e => e.band === 'yellow').length }, severity: red > 0 ? 'critical' : expiring.some(e => e.band === 'amber') ? 'alert' : 'watch', expires_in_min: 360 })
    }
  } catch { /* defensive */ }

  return signals
}

// ─── COMPLIANCE ───────────────────────────────────────────────────────────

async function complianceSignals(businessId: string): Promise<Signal[]> {
  const signals: Signal[] = []

  // abn_check
  try {
    const { data: biz } = await supabaseAdmin.from('businesses').select('abn').eq('id', businessId).maybeSingle()
    const abn = biz?.abn
    const valid = abn && /^\d{11}$/.test(String(abn).replace(/\s/g, ''))
    if (!valid) signals.push({ signal_type: 'abn_check', payload: { abn_present: !!abn, abn_valid_format: false }, severity: 'watch', expires_in_min: 1440 })
  } catch { /* defensive */ }

  return signals
}
