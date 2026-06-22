import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCostBatch } from '@/lib/inventory/resolve-cost'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'

// INV-VELOCITY-1 — HONEST product velocity + ABC tier from REAL completed sales. GROUNDING-TEETH:
// every figure is computed from pos_sale_items (completed only, quantity − returned); cost via the
// INV-COST-1 resolver (NULL-safe — margin is NULL where cost is unknown, never fabricated). The
// analysis window DEFAULTS TO THE ACTUAL DATA WINDOW (min..max sale date), not now()-30d, because the
// data may end days ago (using now() would read everything as dead).
//
// Speculative columns (halo_*, recommended_*, revenue_*_change, recommendation_outcome) are left NULL
// on purpose — later sprints earn them from real co-purchase + experiments.
//
// composite_score (0–100, deterministic) = 60·velocity_norm + 40·margin_norm, where
//   velocity_norm = units_per_day / max(units_per_day)  (0–1 across the catalogue)
//   margin_norm   = clamp(margin_pct/100, 0, 1)         (0 when cost unknown → composite reflects velocity)

export interface VelocityRow {
  product_id: string
  name: string
  units_window: number          // total units over the whole window (this + baseline halves)
  units_per_day: number
  units_this_half: number
  units_baseline_half: number
  velocity_vs_avg: number | null // recent-half/day ÷ baseline-half/day (trend); null if no baseline
  unit_cost: number | null
  margin_pct: number | null
  margin_dollars_per_unit: number | null
  margin_score: number | null   // 0–100, null when cost unknown
  composite_score: number
  abc_tier: 'A' | 'B' | 'C' | 'dead'
  performance_tier: 'star' | 'plowhouse' | 'puzzle' | 'dog' | null // menu quadrant; null when cost unknown
  revenue_window: number
}

export interface VelocityResult {
  window: { start: string; end: string; days: number }
  scored_at: string
  rows: VelocityRow[]
  counts: { A: number; B: number; C: number; dead: number; total: number; uncosted: number }
}

interface AggRow { product_id: string; product_name: string | null; units: number | null; this_half: number | null; base_half: number | null; revenue: number | null; win_start: string | null; win_end: string | null }

const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Compute honest velocity + ABC for every product with sales, over the real data window. */
export async function computeVelocity(supabase: SupabaseClient, businessId: string): Promise<VelocityResult> {
  // Aggregate server-side (avoids the PostgREST row cap that truncates a large JS fetch).
  const { data: aggData } = await supabase.rpc('velocity_aggregate', { p_business: businessId })
  const aggRows = (aggData ?? []) as AggRow[]

  // Day-bucketed scored_at → re-running the same day UPDATES (idempotent), a new day adds a snapshot.
  const scoredAt = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
  if (!aggRows.length) {
    return { window: { start: '', end: '', days: 0 }, scored_at: scoredAt, rows: [], counts: { A: 0, B: 0, C: 0, dead: 0, total: 0, uncosted: 0 } }
  }

  // Window = actual data window (returned by the aggregate; identical across rows).
  const startStr = aggRows[0].win_start ?? ''
  const endStr = aggRows[0].win_end ?? ''
  const start = new Date(startStr), end = new Date(endStr)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const halfDays = Math.max(1, days / 2)

  // Per-product aggregates straight from SQL.
  interface Agg { name: string; units: number; thisHalf: number; baseHalf: number; revenue: number }
  const agg = new Map<string, Agg>()
  for (const r of aggRows) {
    agg.set(r.product_id, {
      name: r.product_name ?? 'Unknown', units: Number(r.units) || 0,
      thisHalf: Number(r.this_half) || 0, baseHalf: Number(r.base_half) || 0, revenue: Number(r.revenue) || 0,
    })
  }

  // Resolve cost + price per product (canonical outlet).
  const outletId = await resolveOutletId(supabase, businessId)
  const costMap = await resolveCostBatch(supabase, businessId, outletId)
  const productIds = [...agg.keys()]
  const { data: prods } = await supabase.from('pos_products').select('id, name, price').in('id', productIds.slice(0, 10000))
  const priceMap = new Map((prods ?? []).map(p => [p.id as string, { name: (p.name as string) ?? 'Unknown', price: Number(p.price) || 0 }]))

  // First pass — per-product metrics.
  const pre = productIds.map(pid => {
    const a = agg.get(pid)!
    const pinfo = priceMap.get(pid)
    const name = pinfo?.name ?? a.name
    const price = pinfo?.price ?? 0
    const resolved = costMap.get(pid) ?? { cost: null, source: 'unknown' as const }
    const cost = resolved.cost
    const unitsPerDay = a.units / days
    const thisPerDay = a.thisHalf / halfDays
    const basePerDay = a.baseHalf / halfDays
    const velocityVsAvg = basePerDay > 0 ? Math.round((thisPerDay / basePerDay) * 100) / 100 : null
    const marginDollars = cost != null && price > 0 ? Math.round((price - cost) * 100) / 100 : null
    const marginPct = cost != null && price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null
    return { pid, name, price, cost, units: a.units, revenue: Math.round(a.revenue * 100) / 100, unitsPerDay, thisHalf: a.thisHalf, baseHalf: a.baseHalf, velocityVsAvg, marginDollars, marginPct }
  })

  const maxUnitsPerDay = Math.max(1e-9, ...pre.map(p => p.unitsPerDay))
  const medUnitsPerDay = median(pre.filter(p => p.units > 0).map(p => p.unitsPerDay))
  const medMarginPct = median(pre.filter(p => p.marginPct != null).map(p => p.marginPct as number))

  // ABC by cumulative revenue (Pareto). Zero-units → 'dead' regardless.
  const byRevenue = [...pre].sort((a, b) => b.revenue - a.revenue)
  const totalRevenue = byRevenue.reduce((s, p) => s + p.revenue, 0) || 1
  let cumulative = 0
  const abcMap = new Map<string, 'A' | 'B' | 'C' | 'dead'>()
  for (const p of byRevenue) {
    if (p.units <= 0) { abcMap.set(p.pid, 'dead'); continue }
    cumulative += p.revenue
    const cumPct = (cumulative / totalRevenue) * 100
    abcMap.set(p.pid, cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C')
  }

  const rows: VelocityRow[] = pre.map(p => {
    const velocityNorm = p.unitsPerDay / maxUnitsPerDay
    const marginNorm = p.marginPct != null ? Math.max(0, Math.min(1, p.marginPct / 100)) : 0
    const composite = Math.round((60 * velocityNorm + 40 * marginNorm) * 10) / 10
    const marginScore = p.marginPct != null ? Math.round(Math.max(0, Math.min(1, p.marginPct / 100)) * 1000) / 10 : null
    const abc = abcMap.get(p.pid)!
    // Menu-engineering quadrant (existing enum): needs both axes → null when cost unknown.
    let perfTier: VelocityRow['performance_tier'] = null
    if (p.marginPct != null) {
      const hiVel = p.unitsPerDay >= medUnitsPerDay
      const hiMargin = p.marginPct >= medMarginPct
      perfTier = hiVel && hiMargin ? 'star' : hiVel && !hiMargin ? 'plowhouse' : !hiVel && hiMargin ? 'puzzle' : 'dog'
    }
    return {
      product_id: p.pid, name: p.name,
      units_window: p.units, units_per_day: Math.round(p.unitsPerDay * 100) / 100,
      units_this_half: p.thisHalf, units_baseline_half: p.baseHalf, velocity_vs_avg: p.velocityVsAvg,
      unit_cost: p.cost, margin_pct: p.marginPct, margin_dollars_per_unit: p.marginDollars, margin_score: marginScore,
      composite_score: composite, abc_tier: abc, performance_tier: perfTier, revenue_window: p.revenue,
    }
  }).sort((a, b) => b.units_per_day - a.units_per_day)

  const counts = { A: 0, B: 0, C: 0, dead: 0, total: rows.length, uncosted: 0 }
  for (const r of rows) { counts[r.abc_tier]++; if (r.margin_pct == null) counts.uncosted++ }

  return { window: { start: startStr.slice(0, 10), end: endStr.slice(0, 10), days }, scored_at: scoredAt, rows, counts }
}

/** Persist a VelocityResult into product_performance_scores (idempotent on UNIQUE(business,product,scored_at)). */
export async function persistVelocity(supabase: SupabaseClient, businessId: string, result: VelocityResult): Promise<void> {
  if (!result.rows.length) return
  const periodHours = result.window.days * 24
  const payload = result.rows.map(r => ({
    business_id: businessId, product_id: r.product_id, scored_at: result.scored_at, period_hours: periodHours,
    units_sold_this_period: r.units_this_half, units_sold_baseline_same_period: r.units_baseline_half,
    velocity_vs_avg: r.velocity_vs_avg, margin_pct: r.margin_pct, margin_dollars_per_unit: r.margin_dollars_per_unit,
    margin_score: r.margin_score, composite_score: r.composite_score,
    performance_tier: r.performance_tier, abc_tier: r.abc_tier,
    // speculative columns intentionally left NULL (not fabricated):
    halo_score: null, halo_products: null, halo_avg_copur_margin: null,
    recommended_grid_position: null, recommended_upsell_product_id: null, recommended_bundle_product_id: null,
    recommended_bundle_price: null, revenue_4h_before_change: null, revenue_4h_after_change: null, recommendation_outcome: null,
  }))
  await supabase.from('product_performance_scores').upsert(payload, { onConflict: 'business_id,product_id,scored_at' })
}

export interface VelocitySummary {
  scored_at: string | null
  top_movers: Array<{ name: string; units_per_day: number; abc_tier: string }>
  dead_stock: Array<{ name: string }>
  counts: { A: number; B: number; C: number; dead: number }
  uncosted: number
}

/** Lightweight groundTruth summary from the persisted table (no window scan). */
export async function velocitySummary(supabase: SupabaseClient, businessId: string): Promise<VelocitySummary> {
  const empty: VelocitySummary = { scored_at: null, top_movers: [], dead_stock: [], counts: { A: 0, B: 0, C: 0, dead: 0 }, uncosted: 0 }
  const { data: latest } = await supabase.from('product_performance_scores')
    .select('scored_at').eq('business_id', businessId).order('scored_at', { ascending: false }).limit(1).maybeSingle()
  if (!latest?.scored_at) return empty
  const { data: scores } = await supabase.from('product_performance_scores')
    .select('product_id, period_hours, units_sold_this_period, units_sold_baseline_same_period, margin_pct, abc_tier')
    .eq('business_id', businessId).eq('scored_at', latest.scored_at as string).limit(10000)
  if (!scores?.length) return empty
  const ids = scores.map(s => s.product_id as string)
  const { data: prods } = await supabase.from('pos_products').select('id, name').in('id', ids.slice(0, 10000))
  const nameMap = new Map((prods ?? []).map(p => [p.id as string, (p.name as string) ?? 'Unknown']))
  const days = Math.max(1, Math.round((Number(scores[0].period_hours) || 24) / 24))
  const counts = { A: 0, B: 0, C: 0, dead: 0 }; let uncosted = 0
  const enriched = scores.map(s => {
    const upd = ((Number(s.units_sold_this_period) || 0) + (Number(s.units_sold_baseline_same_period) || 0)) / days
    const tier = (s.abc_tier as string) ?? 'dead'
    if (tier in counts) counts[tier as keyof typeof counts]++
    if (s.margin_pct == null) uncosted++
    return { name: nameMap.get(s.product_id as string) ?? 'Unknown', units_per_day: Math.round(upd * 100) / 100, abc_tier: tier }
  })
  return {
    scored_at: latest.scored_at as string,
    top_movers: [...enriched].sort((a, b) => b.units_per_day - a.units_per_day).slice(0, 5),
    dead_stock: enriched.filter(e => e.abc_tier === 'dead').slice(0, 20).map(e => ({ name: e.name })),
    counts, uncosted,
  }
}

/** Read the latest persisted velocity snapshot back into display shape (units_window/units_per_day are
 *  reconstructed from the two stored halves + period_hours). Returns null when nothing is persisted yet. */
export async function readPersistedVelocity(supabase: SupabaseClient, businessId: string): Promise<VelocityResult | null> {
  const { data: latest } = await supabase.from('product_performance_scores')
    .select('scored_at').eq('business_id', businessId).order('scored_at', { ascending: false }).limit(1).maybeSingle()
  if (!latest?.scored_at) return null
  const scoredAt = latest.scored_at as string

  const { data: scores } = await supabase.from('product_performance_scores')
    .select('product_id, period_hours, units_sold_this_period, units_sold_baseline_same_period, velocity_vs_avg, margin_pct, margin_dollars_per_unit, margin_score, composite_score, performance_tier, abc_tier')
    .eq('business_id', businessId).eq('scored_at', scoredAt).limit(10000)
  if (!scores?.length) return null

  const ids = scores.map(s => s.product_id as string)
  const { data: prods } = await supabase.from('pos_products').select('id, name, price').in('id', ids.slice(0, 10000))
  const pmap = new Map((prods ?? []).map(p => [p.id as string, { name: (p.name as string) ?? 'Unknown', price: Number(p.price) || 0 }]))
  // Real data window for the honesty note.
  const { data: win } = await supabase.from('pos_sale_items')
    .select('pos_sales!inner(created_at, status)').eq('business_id', businessId).eq('pos_sales.status', 'completed').not('product_id', 'is', null).limit(100000)
  const dates = (win ?? []).map((r: Record<string, unknown>) => (r.pos_sales as { created_at?: string } | null)?.created_at).filter(Boolean).sort() as string[]
  const periodHours = Number(scores[0].period_hours) || 24
  const days = Math.max(1, Math.round(periodHours / 24))

  const rows: VelocityRow[] = scores.map(s => {
    const thisHalf = Number(s.units_sold_this_period) || 0
    const baseHalf = Number(s.units_sold_baseline_same_period) || 0
    const unitsWindow = thisHalf + baseHalf
    const pinfo = pmap.get(s.product_id as string)
    return {
      product_id: s.product_id as string, name: pinfo?.name ?? 'Unknown',
      units_window: unitsWindow, units_per_day: Math.round((unitsWindow / days) * 100) / 100,
      units_this_half: thisHalf, units_baseline_half: baseHalf,
      velocity_vs_avg: s.velocity_vs_avg != null ? Number(s.velocity_vs_avg) : null,
      unit_cost: pinfo && s.margin_dollars_per_unit != null ? Math.round((pinfo.price - Number(s.margin_dollars_per_unit)) * 100) / 100 : null,
      margin_pct: s.margin_pct != null ? Number(s.margin_pct) : null,
      margin_dollars_per_unit: s.margin_dollars_per_unit != null ? Number(s.margin_dollars_per_unit) : null,
      margin_score: s.margin_score != null ? Number(s.margin_score) : null,
      composite_score: Number(s.composite_score) || 0,
      abc_tier: (s.abc_tier as VelocityRow['abc_tier']) ?? 'dead',
      performance_tier: (s.performance_tier as VelocityRow['performance_tier']) ?? null,
      revenue_window: 0,
    }
  }).sort((a, b) => b.units_per_day - a.units_per_day)

  const counts = { A: 0, B: 0, C: 0, dead: 0, total: rows.length, uncosted: 0 }
  for (const r of rows) { counts[r.abc_tier]++; if (r.margin_pct == null) counts.uncosted++ }

  return {
    window: { start: dates.length ? dates[0].slice(0, 10) : '', end: dates.length ? dates[dates.length - 1].slice(0, 10) : '', days },
    scored_at: scoredAt, rows, counts,
  }
}
