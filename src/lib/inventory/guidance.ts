import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { reorderSuggestions } from '@/lib/inventory/buying'

// INV-6 — guidance (Tanpin-Kanri). Aria forms GROUNDED hypotheses from POS + weather + day, turns them into staff
// tasks (inventory_tasks — reused), staff complete them (attributed). GROUNDING-TEETH: every "why" traces to a
// real row; a thin signal is stated as thin, never fabricated. Velocity from product_performance_scores; weather
// = tomorrow's forecast × THIS business's own rain↔sales history (≥14 matched days, ≥3 rain/dry, else "insufficient").

const aestDate = (d = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

// ── weather ───────────────────────────────────────────────────────────────────────────────────────────────
export interface WeatherInsight {
  forecast_rain_pct: number | null
  sufficient: boolean
  matched_days: number
  rain_days: number
  dry_days: number
  rain_lift_pct: number | null   // signed: (avg sales on rain days − dry) / dry
  reason: string | null
}

async function bizCoords(sb: SupabaseClient, businessId: string): Promise<{ lat: number; lng: number }> {
  const { data } = await sb.from('businesses').select('lat, lng').eq('id', businessId).maybeSingle()
  const lat = Number(data?.lat); const lng = Number(data?.lng)
  return { lat: Number.isFinite(lat) ? lat : -37.8136, lng: Number.isFinite(lng) ? lng : 144.9631 } // Melbourne default
}
async function openMeteo(url: string): Promise<{ daily?: Record<string, unknown[]> } | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (!r.ok) return null; return await r.json() } catch { return null }
}

/** Tomorrow's forecast rain chance × the business's OWN 30-day rain↔revenue correlation. Grounded or honest-thin. */
export async function weatherInsight(sb: SupabaseClient, businessId: string): Promise<WeatherInsight> {
  const { lat, lng } = await bizCoords(sb, businessId)
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&timezone=Australia%2FMelbourne`
  const [fc, hist] = await Promise.all([
    openMeteo(`${base}&daily=precipitation_probability_max&forecast_days=2`),
    openMeteo(`${base}&daily=precipitation_sum&past_days=30&forecast_days=0`),
  ])
  const probs = (fc?.daily?.precipitation_probability_max as number[] | undefined) ?? []
  const forecastRain = probs.length > 1 ? Math.round(Number(probs[1]) || 0) : (probs.length ? Math.round(Number(probs[0]) || 0) : null)

  const empty = { forecast_rain_pct: forecastRain, sufficient: false, matched_days: 0, rain_days: 0, dry_days: 0, rain_lift_pct: null }
  const dates = (hist?.daily?.time as string[] | undefined) ?? []
  const precip = (hist?.daily?.precipitation_sum as number[] | undefined) ?? []
  if (!dates.length) return { ...empty, reason: 'weather history unavailable' }
  const rainByDay = new Map<string, number>()
  dates.forEach((d, i) => rainByDay.set(d, Number(precip[i]) || 0))

  // daily revenue, last 30 days (AEST day buckets)
  const since = new Date(Date.now() - 31 * 86400_000).toISOString()
  const { data: sales } = await sb.from('pos_sales').select('total_amount, created_at').eq('business_id', businessId).eq('status', 'completed').gte('created_at', since).limit(50000)
  const revByDay = new Map<string, number>()
  for (const s of sales ?? []) revByDay.set(aestDate(new Date(s.created_at as string)), (revByDay.get(aestDate(new Date(s.created_at as string))) ?? 0) + (Number(s.total_amount) || 0))

  const matched = [...rainByDay.keys()].filter(d => revByDay.has(d))
  if (matched.length < 14) return { ...empty, matched_days: matched.length, reason: `insufficient history (${matched.length}/14 matched days)` }
  const rainDays = matched.filter(d => (rainByDay.get(d) ?? 0) > 1)
  const dryDays = matched.filter(d => (rainByDay.get(d) ?? 0) <= 1)
  if (rainDays.length < 3 || dryDays.length < 3) return { ...empty, matched_days: matched.length, rain_days: rainDays.length, dry_days: dryDays.length, reason: 'not enough rain/dry split to correlate' }
  const avg = (ds: string[]) => ds.reduce((s, d) => s + (revByDay.get(d) ?? 0), 0) / ds.length
  const avgRain = avg(rainDays); const avgDry = avg(dryDays)
  const lift = avgDry > 0 ? Math.round(((avgRain - avgDry) / avgDry) * 1000) / 10 : null
  return { forecast_rain_pct: forecastRain, sufficient: true, matched_days: matched.length, rain_days: rainDays.length, dry_days: dryDays.length, rain_lift_pct: lift, reason: null }
}

// ── velocity ──────────────────────────────────────────────────────────────────────────────────────────────
export interface VelocitySignal { product_id: string; name: string; velocity_vs_avg: number; pct: number; abc_tier: string }
export async function velocitySignals(sb: SupabaseClient, businessId: string, min = 1.2, limit = 5): Promise<VelocitySignal[]> {
  const { data: latest } = await sb.from('product_performance_scores').select('scored_at').eq('business_id', businessId).order('scored_at', { ascending: false }).limit(1).maybeSingle()
  if (!latest?.scored_at) return []
  const { data: scores } = await sb.from('product_performance_scores')
    .select('product_id, velocity_vs_avg, abc_tier').eq('business_id', businessId).eq('scored_at', latest.scored_at as string)
    .gte('velocity_vs_avg', min).order('velocity_vs_avg', { ascending: false }).limit(limit)
  const ids = (scores ?? []).map(s => s.product_id as string)
  if (!ids.length) return []
  const { data: prods } = await sb.from('pos_products').select('id, name').in('id', ids)
  const names = new Map((prods ?? []).map(p => [p.id as string, p.name as string]))
  return (scores ?? []).map(s => ({ product_id: s.product_id as string, name: names.get(s.product_id as string) ?? 'Item', velocity_vs_avg: Number(s.velocity_vs_avg) || 0, pct: Math.round(((Number(s.velocity_vs_avg) || 1) - 1) * 100), abc_tier: (s.abc_tier as string) ?? 'C' }))
}

/** Generate (idempotently, once/day) the velocity + weather tasks — the signals the INV-STAFF-APP-2 base generator
 *  (par/cycle/expiry) doesn't cover. Never duplicates: velocity dedupes on the product constraint; the
 *  product-less weather task is guarded by an explicit "exists today" check. Returns what was added. */
export async function generateGuidanceTasks(sb: SupabaseClient, businessId: string, outletIdIn?: string | null): Promise<{ velocity_added: number; weather_added: number; weather: WeatherInsight | null }> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn ?? null)
  const due = aestDate()
  const { data: existing } = await sb.from('inventory_tasks').select('task_type').eq('business_id', businessId).eq('due_date', due).in('task_type', ['velocity', 'weather'])
  const haveVel = (existing ?? []).some(t => t.task_type === 'velocity')
  const haveWx = (existing ?? []).some(t => t.task_type === 'weather')

  let velAdded = 0
  if (!haveVel) {
    const vs = await velocitySignals(sb, businessId, 1.2, 3)
    if (vs.length) {
      const inserts = vs.map(v => ({
        business_id: businessId, outlet_id: outletId, task_type: 'velocity', product_id: v.product_id,
        title: `Check prep stock — ${v.name}`,
        detail: `Velocity ${v.pct >= 0 ? '+' : ''}${v.pct}% vs baseline · Class-${v.abc_tier}`,
        hypothesis: `${v.name} is selling ${v.pct >= 0 ? '+' : ''}${v.pct}% vs its baseline (product_performance_scores) — a fast mover; make sure prep/stock keeps up.`,
        priority: 22, generated_by: 'aria', due_date: due,
      }))
      const { error } = await sb.from('inventory_tasks').upsert(inserts, { onConflict: 'business_id,outlet_id,product_id,task_type,due_date', ignoreDuplicates: true })
      if (!error) velAdded = inserts.length
    }
  }

  let wxAdded = 0
  let wi: WeatherInsight | null = null
  if (!haveWx) {
    wi = await weatherInsight(sb, businessId)
    const rain = wi.forecast_rain_pct
    // only a GROUNDED weather task: clear forecast + sufficient own-history correlation + a meaningful lift.
    if (rain != null && rain >= 50 && wi.sufficient && wi.rain_lift_pct != null && Math.abs(wi.rain_lift_pct) >= 8) {
      const lift = wi.rain_lift_pct
      const action = lift < 0 ? 'trim fresh prep / baked goods to cut waste' : 'stock up — esp. hot/weather-driven items'
      const { error } = await sb.from('inventory_tasks').insert({
        business_id: businessId, outlet_id: outletId, task_type: 'weather', product_id: null,
        title: 'Prep for tomorrow’s weather',
        detail: `Rain ${rain}% forecast · your rain-day sales run ${lift >= 0 ? '+' : ''}${lift}%`,
        hypothesis: `Rain ${rain}% tomorrow · on rain days (last ${wi.matched_days} days, ${wi.rain_days} rain/${wi.dry_days} dry) your sales averaged ${lift >= 0 ? '+' : ''}${lift}% vs dry — ${action}.`,
        priority: 24, generated_by: 'aria', due_date: due,
      })
      if (!error) wxAdded = 1
    }
  }
  return { velocity_added: velAdded, weather_added: wxAdded, weather: wi }
}

/** Mark a non-count task done — attributed, atomic (a re-complete is a no-op). count/cycle tasks complete via the
 *  INV-4 count flow; this handles velocity/weather/expiring/receive acknowledgements. */
export async function completeTask(sb: SupabaseClient, businessId: string, taskId: string, staffId: string): Promise<{ ok: boolean; idempotent: boolean; task_type: string | null }> {
  const { data } = await sb.from('inventory_tasks')
    .update({ status: 'done', completed_by: staffId, completed_at: new Date().toISOString() })
    .eq('business_id', businessId).eq('id', taskId).eq('status', 'open').select('id, task_type').maybeSingle()
  return { ok: true, idempotent: !data?.id, task_type: (data?.task_type as string | null) ?? null }
}

// ── Pulse ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface Pulse {
  outlet_id: string | null; today_revenue: number; today_txns: number; baseline_avg: number; vs_baseline_pct: number | null
  top_movers: Array<{ name: string; units: number }>; tasks_done: number; tasks_open: number
  attention: { below_reorder: number; expiring: number; open_reviews: number }
}
export async function pulse(sb: SupabaseClient, businessId: string, outletIdIn?: string | null): Promise<Pulse> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn ?? null)
  const todayKey = aestDate()
  const startIso = new Date(`${todayKey}T00:00:00+10:00`).toISOString()
  // today's sales for THIS outlet
  let tq = sb.from('pos_sales').select('id, total_amount').eq('business_id', businessId).eq('status', 'completed').gte('created_at', startIso).limit(20000)
  if (outletId) tq = tq.eq('outlet_id', outletId)
  const { data: today } = await tq
  const todayRevenue = Math.round((today ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0) * 100) / 100
  const todayTxns = (today ?? []).length

  // baseline: avg daily revenue over prior 30 days (excl today), same outlet
  const since = new Date(Date.now() - 31 * 86400_000).toISOString()
  let bq = sb.from('pos_sales').select('total_amount, created_at').eq('business_id', businessId).eq('status', 'completed').gte('created_at', since).lt('created_at', startIso).limit(50000)
  if (outletId) bq = bq.eq('outlet_id', outletId)
  const { data: prior } = await bq
  const byDay = new Map<string, number>()
  for (const s of prior ?? []) { const k = aestDate(new Date(s.created_at as string)); byDay.set(k, (byDay.get(k) ?? 0) + (Number(s.total_amount) || 0)) }
  const baselineAvg = byDay.size ? Math.round(([...byDay.values()].reduce((s, v) => s + v, 0) / byDay.size) * 100) / 100 : 0
  const vsBaseline = baselineAvg > 0 ? Math.round(((todayRevenue - baselineAvg) / baselineAvg) * 1000) / 10 : null

  // top movers today (net units)
  const saleIds = (today ?? []).map(s => s.id as string)
  const movers = new Map<string, { name: string; units: number }>()
  if (saleIds.length) {
    const { data: items } = await sb.from('pos_sale_items').select('product_name, quantity, returned_quantity').in('sale_id', saleIds).limit(20000)
    for (const it of items ?? []) { const n = (it.product_name as string) ?? 'Item'; const u = (Number(it.quantity) || 0) - (Number(it.returned_quantity) || 0); const c = movers.get(n) ?? { name: n, units: 0 }; c.units += u; movers.set(n, c) }
  }
  const topMovers = [...movers.values()].filter(m => m.units > 0).sort((a, b) => b.units - a.units).slice(0, 3)

  // tasks + attention
  const [{ count: done }, { count: open }, { count: reviews }] = await Promise.all([
    sb.from('inventory_tasks').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('due_date', todayKey).eq('status', 'done'),
    sb.from('inventory_tasks').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('due_date', todayKey).eq('status', 'open'),
    sb.from('inventory_review_queue').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'open'),
  ])
  let belowReorder = 0
  try { belowReorder = (await reorderSuggestions(sb, businessId, outletId)).below_count } catch { /* non-fatal */ }
  let expiring = 0
  try {
    const cutoff = aestDate(new Date(Date.now() + 14 * 86400_000))
    const { count } = await sb.from('pos_product_batches').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('expiry_tracked', true).gt('quantity_remaining', 0).lte('expiry_date', cutoff)
    expiring = count ?? 0
  } catch { /* absent → 0 */ }

  return { outlet_id: outletId, today_revenue: todayRevenue, today_txns: todayTxns, baseline_avg: baselineAvg, vs_baseline_pct: vsBaseline, top_movers: topMovers, tasks_done: done ?? 0, tasks_open: open ?? 0, attention: { below_reorder: belowReorder, expiring, open_reviews: reviews ?? 0 } }
}

// ── Handover ──────────────────────────────────────────────────────────────────────────────────────────────
export interface Handover {
  done: Array<{ title: string; type: string; by: string }>
  open: Array<{ title: string; type: string; why: string | null }>
  flagged: { open_reviews: number; expiring: number; below_reorder: number }
}
export async function handover(sb: SupabaseClient, businessId: string, outletIdIn?: string | null): Promise<Handover> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn ?? null)
  const todayKey = aestDate()
  const { data: tasks } = await sb.from('inventory_tasks')
    .select('title, task_type, status, hypothesis, completed_by').eq('business_id', businessId).eq('due_date', todayKey).order('priority', { ascending: false }).limit(200)
  const staffIds = Array.from(new Set((tasks ?? []).map(t => t.completed_by).filter(Boolean) as string[]))
  const { data: staff } = staffIds.length ? await sb.from('pos_staff').select('id, name').in('id', staffIds) : { data: [] }
  const sname = new Map((staff ?? []).map((s: { id: string; name: string }) => [s.id, s.name]))
  const done = (tasks ?? []).filter(t => t.status === 'done').map(t => ({ title: t.title as string, type: t.task_type as string, by: sname.get(t.completed_by as string) ?? 'Staff' }))
  const open = (tasks ?? []).filter(t => t.status === 'open').map(t => ({ title: t.title as string, type: t.task_type as string, why: (t.hypothesis as string | null) ?? null }))

  const p = await pulse(sb, businessId, outletId)
  return { done, open, flagged: { open_reviews: p.attention.open_reviews, expiring: p.attention.expiring, below_reorder: p.attention.below_reorder } }
}
