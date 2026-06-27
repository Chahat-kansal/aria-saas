import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'

// INV-WASTE-1 — attributed waste logging. THE DISTINCTION FROM A COUNT: a count is a verification and NEVER
// moves stock (it raises a review). WASTE is a real physical loss — the staffer asserts "this stock is gone"
// — so it DOES decrement items_on_hand directly, attributed. The canonical mover (adjustOutletStock) runs
// exactly ONCE; the pos_stock_adjustments row is an audit record only (no second decrement). On top of that,
// an ABNORMAL waste (a spike vs the product's own recent norm / on-hand) ALSO files a waste_spike review so
// the owner sees unusual loss. cost_cents is stored in CENTS (the column's unit) and NULL when cost unknown.

export const WASTE_REASONS = ['spoilage', 'prep_error', 'over_portion', 'breakage', 'expired', 'damaged', 'other'] as const

// Spike thresholds — documented + grounded (no unexplained magic):
//  • SPIKE_MIN_UNITS: never flag a trivial 1–2 unit loss as a "spike".
//  • SPIKE_MULTIPLE: today's waste must be ≥ 3× the product's prior 7-day daily-average waste to be an outlier
//    vs its OWN norm (not normal day-to-day variance).
//  • No-history fallback (baseline 0): flag only a genuinely large first loss — ≥ SPIKE_FIRST_UNITS in a day,
//    OR ≥ SPIKE_ONHAND_FRAC of the on-hand dumped at once (losing a quarter of stock in one go is abnormal).
const SPIKE_MIN_UNITS = 3
const SPIKE_MULTIPLE = 3
const SPIKE_FIRST_UNITS = 5
const SPIKE_ONHAND_FRAC = 0.25

export interface WasteResult {
  waste_id: string | null
  quantity: number
  unit_cost: number | null
  cost_cents: number | null
  on_hand_before: number
  new_on_hand: number | null
  spike: boolean
  review_id: string | null
  idempotent: boolean
  staff_name: string
}

interface WasteParams {
  businessId: string
  outletIdIn?: string | null
  productId: string
  productName?: string | null
  quantity: number
  unit?: string | null
  reason?: string | null
  staffId: string
  staffName: string
}

function aestStartIso(daysAgo = 0): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(Date.now() - daysAgo * 86400_000))
  return new Date(`${day}T00:00:00+10:00`).toISOString()
}

export async function logWaste(supabase: SupabaseClient, p: WasteParams): Promise<WasteResult> {
  const outletId = await resolveOutletId(supabase, p.businessId, p.outletIdIn ?? null)
  const quantity = Math.max(1, Math.round(Number(p.quantity) || 0))
  const reason = (p.reason && String(p.reason).trim()) || 'other'

  // Idempotency: a re-submit of the same staff+product+qty within a minute is a no-op (no dup row / no double
  // decrement). recorded_by carries the staff name; we match on it.
  const minuteAgo = new Date(Date.now() - 60_000).toISOString()
  const { data: dup } = await supabase.from('pos_waste_log').select('id')
    .eq('business_id', p.businessId).eq('product_id', p.productId).eq('recorded_by', p.staffName)
    .eq('quantity', quantity).gte('recorded_at', minuteAgo).limit(1).maybeSingle()
  if (dup?.id) {
    const { data: inv } = await supabase.from('pos_outlet_inventory').select('items_on_hand')
      .eq('business_id', p.businessId).eq('product_id', p.productId).eq('outlet_id', outletId ?? '').maybeSingle()
    return { waste_id: dup.id as string, quantity, unit_cost: null, cost_cents: null, on_hand_before: Number(inv?.items_on_hand ?? 0), new_on_hand: Number(inv?.items_on_hand ?? 0), spike: false, review_id: null, idempotent: true, staff_name: p.staffName }
  }

  // On-hand BEFORE (for the spike on-hand-fraction rule + reporting the single decrement).
  const { data: invBefore } = await supabase.from('pos_outlet_inventory').select('items_on_hand')
    .eq('business_id', p.businessId).eq('product_id', p.productId).eq('outlet_id', outletId ?? '').maybeSingle()
  const onHandBefore = Number(invBefore?.items_on_hand ?? 0)

  // Real cost → cents (NULL-safe: unknown cost stays NULL, never fabricated as 0).
  let unitCost: number | null = null
  try { unitCost = (await resolveCostFor(supabase, p.businessId, p.productId, outletId)).cost } catch { /* unknown */ }
  const costCents = unitCost != null ? Math.round(unitCost * quantity * 100) : null

  // 1) The waste record.
  const { data: wrow } = await supabase.from('pos_waste_log').insert({
    business_id: p.businessId, product_id: p.productId, product_name: p.productName ?? 'Item',
    quantity, unit: p.unit ?? 'unit', reason, recorded_by: p.staffName, recorded_at: new Date().toISOString(),
    cost_cents: costCents,
  }).select('id').maybeSingle()
  const wasteId = (wrow?.id as string) ?? null

  // 2) THE SINGLE stock mutation — waste is a real loss, so items_on_hand drops (atomic, never negative).
  const newOnHand = outletId ? await adjustOutletStock(supabase, { businessId: p.businessId, outletId, productId: p.productId, delta: -quantity }) : null

  // 3) Audit-only mirror in the attributed adjustment rail (INSERT only — does NOT move stock again).
  if (outletId) {
    await supabase.from('pos_stock_adjustments').insert({
      business_id: p.businessId, product_id: p.productId, outlet_id: outletId,
      adjustment_qty: -quantity, reason: 'waste', adjusted_by: p.staffName,
    })
  }

  // 4) Spike detection → owner review (does not touch stock; one open spike per product/day).
  const { spike, review_id } = await detectSpike(supabase, p, outletId, quantity, onHandBefore, reason)

  return { waste_id: wasteId, quantity, unit_cost: unitCost, cost_cents: costCents, on_hand_before: onHandBefore, new_on_hand: newOnHand, spike, review_id, idempotent: false, staff_name: p.staffName }
}

async function detectSpike(
  supabase: SupabaseClient, p: WasteParams, outletId: string | null, justWasted: number, onHandBefore: number, reason: string,
): Promise<{ spike: boolean; review_id: string | null }> {
  const todayStart = aestStartIso(0)
  const weekStart = aestStartIso(7)

  // Today's TOTAL waste for this product (includes the row we just wrote).
  const { data: todayRows } = await supabase.from('pos_waste_log').select('quantity')
    .eq('business_id', p.businessId).eq('product_id', p.productId).gte('recorded_at', todayStart)
  const todayQty = (todayRows ?? []).reduce((s, r) => s + (Number(r.quantity) || 0), 0)

  // Prior 7 days (excluding today) → daily-average baseline.
  const { data: priorRows } = await supabase.from('pos_waste_log').select('quantity')
    .eq('business_id', p.businessId).eq('product_id', p.productId).gte('recorded_at', weekStart).lt('recorded_at', todayStart)
  const prior7 = (priorRows ?? []).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  const baselineDaily = prior7 / 7

  const big = baselineDaily > 0
    ? todayQty >= SPIKE_MULTIPLE * baselineDaily
    : (todayQty >= SPIKE_FIRST_UNITS || (onHandBefore > 0 && todayQty >= SPIKE_ONHAND_FRAC * onHandBefore))
  const spike = todayQty >= SPIKE_MIN_UNITS && big
  if (!spike) return { spike: false, review_id: null }

  // One open waste_spike per product/day.
  const { data: existing } = await supabase.from('inventory_review_queue').select('id')
    .eq('business_id', p.businessId).eq('product_id', p.productId).eq('flag_type', 'waste_spike')
    .eq('status', 'open').gte('created_at', todayStart).limit(1).maybeSingle()
  if (existing?.id) return { spike: true, review_id: existing.id as string }

  const { data: rev } = await supabase.from('inventory_review_queue').insert({
    business_id: p.businessId, outlet_id: outletId, flag_type: 'waste_spike', product_id: p.productId,
    expected_value: Math.round(baselineDaily * 100) / 100, actual_value: todayQty, variance: Math.round((todayQty - baselineDaily) * 100) / 100,
    evidence: { today_qty: todayQty, baseline_daily: Math.round(baselineDaily * 100) / 100, on_hand_before: onHandBefore, reason, just_wasted: justWasted, staff_id: p.staffId, staff_name: p.staffName, product_name: p.productName ?? null, detected_at: new Date().toISOString() },
    raised_by_staff_id: p.staffId, status: 'open',
  }).select('id').maybeSingle()
  return { spike: true, review_id: (rev?.id as string) ?? null }
}

/** Today's waste list + total cost (cents) for a business/outlet — drives the staff-app "waste today" panel. */
export async function wasteTodaySummary(supabase: SupabaseClient, businessId: string, outletId: string | null) {
  const todayStart = aestStartIso(0)
  // pos_waste_log has no outlet_id column → business-scoped for the day (single-outlet correct; multi-outlet
  // shows the business total for today, which is the honest figure available).
  void outletId
  const { data } = await supabase.from('pos_waste_log')
    .select('id, product_name, quantity, unit, reason, recorded_by, recorded_at, cost_cents')
    .eq('business_id', businessId).gte('recorded_at', todayStart).order('recorded_at', { ascending: false }).limit(100)
  const items = (data ?? []).map(r => ({
    id: r.id as string, product_name: r.product_name as string, quantity: Number(r.quantity) || 0,
    unit: (r.unit as string | null) ?? 'unit', reason: (r.reason as string | null) ?? 'other',
    recorded_by: (r.recorded_by as string | null) ?? 'Staff', recorded_at: r.recorded_at as string,
    cost_cents: r.cost_cents != null ? Number(r.cost_cents) : null,
  }))
  const total_cost_cents = items.reduce((s, i) => s + (i.cost_cents ?? 0), 0)
  return { items, total_cost_cents, count: items.length }
}

/** GroundTruth signals: today's + 7-day waste $, top wasted item, dominant reason — feed the business brain. */
export async function wasteGroundTruth(supabase: SupabaseClient, businessId: string): Promise<{ waste_today_dollars: number; waste_spikes_open: number; waste_7d_dollars: number; top_waste_item: string | null; dominant_reason: string | null }> {
  const todayStart = aestStartIso(0)
  const week7Start = aestStartIso(7)
  const [{ data: todayRows }, { count: spikes }, { data: weekRows }] = await Promise.all([
    supabase.from('pos_waste_log').select('cost_cents').eq('business_id', businessId).gte('recorded_at', todayStart),
    supabase.from('inventory_review_queue').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('flag_type', 'waste_spike').eq('status', 'open'),
    supabase.from('pos_waste_log').select('product_name, cost_cents, reason').eq('business_id', businessId).gte('recorded_at', week7Start).limit(5000),
  ])
  const todayCents = (todayRows ?? []).reduce((s, r) => s + (Number(r.cost_cents) || 0), 0)
  const weekCents = (weekRows ?? []).reduce((s, r) => s + (Number(r.cost_cents) || 0), 0)

  // Top wasted item by total cost_cents over 7 days.
  const byProduct = new Map<string, number>()
  for (const w of weekRows ?? []) {
    const n = (w.product_name as string | null) ?? 'Item'
    byProduct.set(n, (byProduct.get(n) ?? 0) + (Number(w.cost_cents) || 0))
  }
  const sortedProducts = [...byProduct.entries()].sort((a, b) => b[1] - a[1])
  const topWasteItem = sortedProducts.length > 0 ? sortedProducts[0][0] : null

  // Dominant reason code. Normalize "other: <note>" → "other".
  const byReason = new Map<string, number>()
  for (const w of weekRows ?? []) {
    const raw = (w.reason as string | null) ?? 'other'
    const code = raw.startsWith('other:') ? 'other' : raw
    byReason.set(code, (byReason.get(code) ?? 0) + 1)
  }
  const sortedReasons = [...byReason.entries()].sort((a, b) => b[1] - a[1])
  const dominantReason = sortedReasons.length > 0 ? sortedReasons[0][0] : null

  return { waste_today_dollars: Math.round(todayCents) / 100, waste_spikes_open: spikes ?? 0, waste_7d_dollars: Math.round(weekCents) / 100, top_waste_item: topWasteItem, dominant_reason: dominantReason }
}
