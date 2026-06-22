import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'

// INV-PAR-1 — auto reorder_point / target_stock / reorder_qty from REAL velocity (GROUNDING-TEETH: only
// from product_performance_scores; cost is NOT needed for par). ABC-aware safety. Owner-tunable knobs live
// on reorder_settings (lead time, buffer, review cycle, MOQ). Idempotent; never touches low_stock_threshold.
//
// MATH (per product, units in items):
//   units_per_day = (units_this_period + units_baseline) / (period_hours/24)   ← full-window daily rate
//   safety_days   = buffer_weeks × 7 × abc_safety_mult
//   reorder_point = round( units_per_day × (lead_time_days + safety_days) )
//   target_stock  = round( units_per_day × (lead_time_days + safety_days + review_cycle_days) )
//   reorder_qty   = max( target_stock − reorder_point, MOQ )   ← standing order-up qty
//   Dead / below min-velocity → par 0 + a "review, maybe delist" note (never an aggressive reorder).
//
// ABC safety multipliers (A never runs dry → more safety; C ties less cash → less safety):
//   A 1.5 · B 1.0 · C 0.6 · (dead → no reorder)

export interface ParSettings {
  lead_time_days: number
  buffer_weeks: number
  review_cycle_days: number
  default_reorder_qty: number   // MOQ / pack
  min_velocity_per_day: number  // below this = treat as dead (review, not reorder)
}

const DEFAULT_SETTINGS: ParSettings = { lead_time_days: 3, buffer_weeks: 1, review_cycle_days: 7, default_reorder_qty: 12, min_velocity_per_day: 0.05 }
const ABC_SAFETY: Record<string, number> = { A: 1.5, B: 1.0, C: 0.6, dead: 0 }

/** Read the business's reorder settings; seed a sensible default row if missing (owner-editable later). */
export async function getOrSeedReorderSettings(supabase: SupabaseClient, businessId: string): Promise<ParSettings> {
  const { data } = await supabase.from('reorder_settings')
    .select('lead_time_days, buffer_weeks, review_cycle_days, default_reorder_qty, min_velocity_per_day')
    .eq('business_id', businessId).maybeSingle()
  if (data) {
    return {
      lead_time_days: Number(data.lead_time_days ?? DEFAULT_SETTINGS.lead_time_days),
      buffer_weeks: Number(data.buffer_weeks ?? DEFAULT_SETTINGS.buffer_weeks),
      review_cycle_days: Number(data.review_cycle_days ?? DEFAULT_SETTINGS.review_cycle_days),
      default_reorder_qty: Number(data.default_reorder_qty ?? DEFAULT_SETTINGS.default_reorder_qty),
      min_velocity_per_day: Number(data.min_velocity_per_day ?? DEFAULT_SETTINGS.min_velocity_per_day),
    }
  }
  // Seed the singleton (UNIQUE business_id) with sensible defaults — owner can tune in the UI.
  await supabase.from('reorder_settings').upsert({
    business_id: businessId,
    lead_time_days: DEFAULT_SETTINGS.lead_time_days, buffer_weeks: DEFAULT_SETTINGS.buffer_weeks,
    review_cycle_days: DEFAULT_SETTINGS.review_cycle_days, default_reorder_qty: DEFAULT_SETTINGS.default_reorder_qty,
    min_velocity_per_day: DEFAULT_SETTINGS.min_velocity_per_day, updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id' })
  return { ...DEFAULT_SETTINGS }
}

export interface ParRow {
  product_id: string
  name: string
  units_per_day: number
  abc_tier: string
  reorder_point: number
  target_stock: number
  reorder_qty: number
  on_hand: number
  days_of_cover: number | null   // on_hand / units_per_day; null when no velocity
  below_reorder: boolean
  suggested_qty: number          // dynamic: max(target − on_hand, MOQ) when below; else 0
  review: boolean                // dead / below-min-velocity → review, not reorder
}

export interface ParResult { settings: ParSettings; rows: ParRow[]; below_count: number; reviewed_count: number }

/** Compute par levels for every product from the latest velocity snapshot. Writes pos_products par cols. */
export async function computePar(supabase: SupabaseClient, businessId: string): Promise<ParResult> {
  const settings = await getOrSeedReorderSettings(supabase, businessId)
  const safetyBase = settings.buffer_weeks * 7

  // Latest velocity snapshot per product.
  const { data: latest } = await supabase.from('product_performance_scores')
    .select('scored_at').eq('business_id', businessId).order('scored_at', { ascending: false }).limit(1).maybeSingle()
  if (!latest?.scored_at) return { settings, rows: [], below_count: 0, reviewed_count: 0 }

  const { data: scores } = await supabase.from('product_performance_scores')
    .select('product_id, period_hours, units_sold_this_period, units_sold_baseline_same_period, abc_tier')
    .eq('business_id', businessId).eq('scored_at', latest.scored_at as string).limit(10000)
  if (!scores?.length) return { settings, rows: [], below_count: 0, reviewed_count: 0 }

  const ids = scores.map(s => s.product_id as string)
  const { data: prods } = await supabase.from('pos_products').select('id, name').in('id', ids.slice(0, 10000))
  const nameMap = new Map((prods ?? []).map(p => [p.id as string, (p.name as string) ?? 'Unknown']))

  // Canonical on-hand per outlet.
  const outletId = await resolveOutletId(supabase, businessId)
  const onHandMap = new Map<string, number>()
  if (outletId) {
    const { data: inv } = await supabase.from('pos_outlet_inventory').select('product_id, items_on_hand')
      .eq('business_id', businessId).eq('outlet_id', outletId).in('product_id', ids.slice(0, 10000))
    for (const r of inv ?? []) onHandMap.set(r.product_id as string, Number(r.items_on_hand) || 0)
  }

  const rows: ParRow[] = []
  const updates: Array<{ id: string; reorder_point: number; target_stock: number; reorder_qty: number; review: boolean }> = []

  for (const s of scores) {
    const pid = s.product_id as string
    const days = Math.max(1, (Number(s.period_hours) || 24) / 24)
    const unitsPerDay = ((Number(s.units_sold_this_period) || 0) + (Number(s.units_sold_baseline_same_period) || 0)) / days
    const tier = (s.abc_tier as string) ?? 'dead'
    const onHand = onHandMap.get(pid) ?? 0
    const review = tier === 'dead' || unitsPerDay < settings.min_velocity_per_day

    let reorderPoint = 0, targetStock = 0, reorderQty = 0
    if (!review) {
      const safetyDays = safetyBase * (ABC_SAFETY[tier] ?? 1)
      reorderPoint = Math.round(unitsPerDay * (settings.lead_time_days + safetyDays))
      targetStock = Math.round(unitsPerDay * (settings.lead_time_days + safetyDays + settings.review_cycle_days))
      reorderQty = Math.max(targetStock - reorderPoint, settings.default_reorder_qty)
    }

    const belowReorder = !review && onHand <= reorderPoint
    const suggestedQty = belowReorder ? Math.max(targetStock - onHand, settings.default_reorder_qty) : 0
    const daysOfCover = unitsPerDay > 0 ? Math.round((onHand / unitsPerDay) * 10) / 10 : null

    rows.push({
      product_id: pid, name: nameMap.get(pid) ?? 'Unknown',
      units_per_day: Math.round(unitsPerDay * 100) / 100, abc_tier: tier,
      reorder_point: reorderPoint, target_stock: targetStock, reorder_qty: reorderQty,
      on_hand: onHand, days_of_cover: daysOfCover, below_reorder: belowReorder, suggested_qty: suggestedQty, review,
    })
    updates.push({ id: pid, reorder_point: reorderPoint, target_stock: targetStock, reorder_qty: reorderQty, review })
  }

  // Persist par to pos_products (additive — never touches low_stock_threshold). Idempotent (updates in place).
  for (const u of updates) {
    await supabase.from('pos_products').update({
      reorder_point: u.reorder_point, target_stock: u.target_stock, reorder_qty: u.reorder_qty,
      reorder_notes: u.review ? 'INV-PAR: low/zero velocity — review, maybe delist' : 'INV-PAR: auto from velocity',
    }).eq('id', u.id).eq('business_id', businessId)
  }

  rows.sort((a, b) => (a.days_of_cover ?? 1e9) - (b.days_of_cover ?? 1e9))
  return { settings, rows, below_count: rows.filter(r => r.below_reorder).length, reviewed_count: rows.filter(r => r.review).length }
}

/** Owner override of a single product's par (flagged + persisted). */
export async function setProductPar(supabase: SupabaseClient, businessId: string, productId: string, patch: { reorder_point?: number; target_stock?: number; reorder_qty?: number }): Promise<void> {
  const upd: Record<string, unknown> = { reorder_notes: 'INV-PAR: owner override' }
  if (patch.reorder_point != null) upd.reorder_point = Math.max(0, Math.round(patch.reorder_point))
  if (patch.target_stock != null) upd.target_stock = Math.max(0, Math.round(patch.target_stock))
  if (patch.reorder_qty != null) upd.reorder_qty = Math.max(0, Math.round(patch.reorder_qty))
  await supabase.from('pos_products').update(upd).eq('id', productId).eq('business_id', businessId)
}

/** Lightweight groundTruth: how many products are below their reorder point right now. */
export async function reorderSummary(supabase: SupabaseClient, businessId: string): Promise<{ below_count: number; review_count: number; top: Array<{ name: string; on_hand: number; reorder_point: number; days_of_cover: number | null; suggested_qty: number }> }> {
  const res = await computeParReadonly(supabase, businessId)
  const below = res.rows.filter(r => r.below_reorder)
  return {
    below_count: below.length,
    review_count: res.rows.filter(r => r.review).length,
    top: below.slice(0, 8).map(r => ({ name: r.name, on_hand: r.on_hand, reorder_point: r.reorder_point, days_of_cover: r.days_of_cover, suggested_qty: r.suggested_qty })),
  }
}

/** Read-only par view from STORED pos_products par cols (no writes) — for GET + groundTruth. */
export async function computeParReadonly(supabase: SupabaseClient, businessId: string): Promise<ParResult> {
  const settings = await getOrSeedReorderSettings(supabase, businessId)
  const { data: latest } = await supabase.from('product_performance_scores')
    .select('scored_at').eq('business_id', businessId).order('scored_at', { ascending: false }).limit(1).maybeSingle()
  const velMap = new Map<string, { upd: number; tier: string }>()
  if (latest?.scored_at) {
    const { data: scores } = await supabase.from('product_performance_scores')
      .select('product_id, period_hours, units_sold_this_period, units_sold_baseline_same_period, abc_tier')
      .eq('business_id', businessId).eq('scored_at', latest.scored_at as string).limit(10000)
    for (const s of scores ?? []) {
      const days = Math.max(1, (Number(s.period_hours) || 24) / 24)
      velMap.set(s.product_id as string, { upd: ((Number(s.units_sold_this_period) || 0) + (Number(s.units_sold_baseline_same_period) || 0)) / days, tier: (s.abc_tier as string) ?? 'dead' })
    }
  }
  const { data: prods } = await supabase.from('pos_products')
    .select('id, name, reorder_point, target_stock, reorder_qty, reorder_notes').eq('business_id', businessId).limit(10000)
  const outletId = await resolveOutletId(supabase, businessId)
  const onHandMap = new Map<string, number>()
  if (outletId) {
    const { data: inv } = await supabase.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', businessId).eq('outlet_id', outletId).limit(10000)
    for (const r of inv ?? []) onHandMap.set(r.product_id as string, Number(r.items_on_hand) || 0)
  }
  const rows: ParRow[] = (prods ?? []).map(p => {
    const pid = p.id as string
    const vel = velMap.get(pid)
    const upd = vel?.upd ?? 0
    const tier = vel?.tier ?? 'dead'
    const onHand = onHandMap.get(pid) ?? 0
    const rp = Number(p.reorder_point) || 0, ts = Number(p.target_stock) || 0, rq = Number(p.reorder_qty) || 0
    const review = String(p.reorder_notes ?? '').includes('review') || tier === 'dead'
    const belowReorder = !review && rp > 0 && onHand <= rp
    return {
      product_id: pid, name: (p.name as string) ?? 'Unknown', units_per_day: Math.round(upd * 100) / 100, abc_tier: tier,
      reorder_point: rp, target_stock: ts, reorder_qty: rq, on_hand: onHand,
      days_of_cover: upd > 0 ? Math.round((onHand / upd) * 10) / 10 : null,
      below_reorder: belowReorder, suggested_qty: belowReorder ? Math.max(ts - onHand, settings.default_reorder_qty) : 0, review,
    }
  }).sort((a, b) => (a.days_of_cover ?? 1e9) - (b.days_of_cover ?? 1e9))
  return { settings, rows, below_count: rows.filter(r => r.below_reorder).length, reviewed_count: rows.filter(r => r.review).length }
}
