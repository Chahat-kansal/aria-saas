import type { SupabaseClient } from '@supabase/supabase-js'
import type { Grounding } from '@/lib/aria/compute/provenance'

// INV-COST-1 — one trustworthy "current unit cost" per (product, outlet). GROUNDING-TEETH: a cost is only
// ever a REAL number from one of the known sources; an absent/zero cost is reported as `unknown` (NULL),
// never silently treated as 0 and never fabricated. The resolver returns its provenance so the UI/AI can
// say where the number came from ("from last delivery" vs "catalogue" vs "unknown").
//
// Resolution order (documented + locked):
//   1. pos_outlet_inventory.item_cost                 (per-outlet actual)         if > 0
//   2. pos_outlet_inventory.last_item_cost             (per-outlet last receipt)  if > 0
//   3. pos_purchase_order_lines.confirmed_price        (latest confirmed PO)      if > 0
//   4. pos_purchase_order_lines.last_purchase_price    (latest PO line's last price) if > 0
//   5. pos_products.cost_price                         (business-level catalogue) if > 0
//   6. else NULL → 'unknown'
//
// INTEL-COMPUTE-1 — tiers 3/4 (purchase-order history) were previously only checked by a separate,
// divergent resolver (src/lib/orders/resolve-unit-cost.ts's resolveUnitCost) that, once PO history
// came up empty too, fabricated a cost as `price * 0.6` rather than reporting unknown. That resolver
// now delegates here instead of reimplementing its own chain — this is the one place a "real cost"
// can come from PO history, and it never fabricates.

// Provenance labels are owner-facing: 'outlet' (per-outlet actual item_cost), 'last_delivery'
// (last receipt cost), 'purchase_order' (latest confirmed/last PO line price), 'catalogue'
// (business-level cost_price), 'unknown' (no resolvable cost).
export type CostSource = 'outlet' | 'last_delivery' | 'purchase_order' | 'catalogue' | 'unknown'
export interface ResolvedCost { cost: number | null; source: CostSource; grounding: Grounding | null }

// INTEL-TRUTH-1 — maps each resolution tier to a Business Truth type. 'outlet' is today's actual
// per-outlet cost (verified). 'last_delivery'/'purchase_order' are real recorded prices, but using
// them as the CURRENT cost assumes nothing has changed since (one step removed — derived).
// 'catalogue' (pos_products.cost_price) is a manually-maintained reference figure not tied to any
// specific transaction — the weakest tier before giving up, matching provenance.ts's own worked
// example for 'estimated' ("a resolved cost falling back to an estimate"). 'unknown' has no cost at
// all, so it carries no grounding — callers must handle null explicitly, never default it.
const SOURCE_GROUNDING: Record<CostSource, Grounding | null> = {
  outlet: 'verified',
  last_delivery: 'derived',
  purchase_order: 'derived',
  catalogue: 'estimated',
  unknown: null,
}

function pos(n: unknown): number | null {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : null
}

/** Pure resolver over already-fetched values. */
export function resolveCost(input: { item_cost?: unknown; last_item_cost?: unknown; po_confirmed_price?: unknown; po_last_purchase_price?: unknown; cost_price?: unknown }): ResolvedCost {
  const ic = pos(input.item_cost)
  if (ic != null) return { cost: ic, source: 'outlet', grounding: SOURCE_GROUNDING.outlet }
  const lic = pos(input.last_item_cost)
  if (lic != null) return { cost: lic, source: 'last_delivery', grounding: SOURCE_GROUNDING.last_delivery }
  const pc = pos(input.po_confirmed_price)
  if (pc != null) return { cost: pc, source: 'purchase_order', grounding: SOURCE_GROUNDING.purchase_order }
  const plp = pos(input.po_last_purchase_price)
  if (plp != null) return { cost: plp, source: 'purchase_order', grounding: SOURCE_GROUNDING.purchase_order }
  const cp = pos(input.cost_price)
  if (cp != null) return { cost: cp, source: 'catalogue', grounding: SOURCE_GROUNDING.catalogue }
  return { cost: null, source: 'unknown', grounding: null }
}

/**
 * Latest PO price for a product, only queried when outlet/catalogue costs are both unknown.
 *
 * MS8 PHASE 2 — THIS TIER HAD NEVER RETURNED A COST, because it read the wrong table.
 *
 * It queried `pos_purchase_order_lines`, which holds **0 rows**. The system's only recorded
 * purchase costs live in `pos_purchase_order_items.unit_cost` — **5 rows, all populated**. So the
 * one tier backed by an actual supplier transaction was invisible to the resolver, and any product
 * without an outlet or catalogue cost resolved to `unknown` even when a real purchase price existed.
 *
 * Both tables are now consulted, `lines` first: it carries the richer vocabulary
 * (confirmed_price vs last_purchase_price) and is the newer schema, so if it ever gains rows it
 * keeps precedence and nothing about existing behaviour changes. `items` is the fallback that
 * actually has data today.
 *
 * `items` carries no business_id — it scopes through its parent order — so it is joined to
 * pos_purchase_orders and filtered there. Ordering is by the ORDER's created_at, since the line
 * rows have no timestamp of their own.
 */
async function latestPoLinePrice(supabase: SupabaseClient, businessId: string, productId: string): Promise<{ po_confirmed_price?: unknown; po_last_purchase_price?: unknown }> {
  const { data: line } = await supabase.from('pos_purchase_order_lines')
    .select('confirmed_price, last_purchase_price')
    .eq('business_id', businessId).eq('product_id', productId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (line?.confirmed_price != null || line?.last_purchase_price != null) {
    return { po_confirmed_price: line?.confirmed_price, po_last_purchase_price: line?.last_purchase_price }
  }

  const { data: item } = await supabase.from('pos_purchase_order_items')
    .select('unit_cost, pos_purchase_orders!inner(business_id, created_at)')
    .eq('product_id', productId)
    .eq('pos_purchase_orders.business_id', businessId)
    .order('created_at', { ascending: false, referencedTable: 'pos_purchase_orders' })
    .limit(1).maybeSingle()
  // A received PO line's unit_cost is a price actually paid, so it maps to the same tier as a
  // confirmed_price rather than to the softer last_purchase_price.
  return { po_confirmed_price: item?.unit_cost }
}

/** Resolve one product's current unit cost at an outlet. */
export async function resolveCostFor(supabase: SupabaseClient, businessId: string, productId: string, outletId: string | null): Promise<ResolvedCost> {
  const { data: prod } = await supabase.from('pos_products').select('cost_price').eq('id', productId).eq('business_id', businessId).maybeSingle()
  let oi: { item_cost?: unknown; last_item_cost?: unknown } = {}
  if (outletId) {
    const { data } = await supabase.from('pos_outlet_inventory').select('item_cost, last_item_cost')
      .eq('business_id', businessId).eq('product_id', productId).eq('outlet_id', outletId).maybeSingle()
    oi = data ?? {}
  }
  const base = resolveCost({ item_cost: oi.item_cost, last_item_cost: oi.last_item_cost, cost_price: prod?.cost_price })
  if (base.source !== 'unknown') return base
  const po = await latestPoLinePrice(supabase, businessId, productId)
  return resolveCost({ ...po, cost_price: prod?.cost_price })
}

/** Batch-resolve cost for every product at an outlet → Map<product_id, ResolvedCost>. */
export async function resolveCostBatch(supabase: SupabaseClient, businessId: string, outletId: string | null): Promise<Map<string, ResolvedCost>> {
  const { data: products } = await supabase.from('pos_products').select('id, cost_price').eq('business_id', businessId).limit(10000)
  const oiMap = new Map<string, { item_cost?: unknown; last_item_cost?: unknown }>()
  if (outletId) {
    const { data: inv } = await supabase.from('pos_outlet_inventory').select('product_id, item_cost, last_item_cost')
      .eq('business_id', businessId).eq('outlet_id', outletId).limit(10000)
    for (const r of inv ?? []) oiMap.set(r.product_id as string, { item_cost: r.item_cost, last_item_cost: r.last_item_cost })
  }
  const out = new Map<string, ResolvedCost>()
  const stillUnknown: string[] = []
  for (const p of products ?? []) {
    const oi = oiMap.get(p.id as string) ?? {}
    const resolved = resolveCost({ item_cost: oi.item_cost, last_item_cost: oi.last_item_cost, cost_price: p.cost_price })
    out.set(p.id as string, resolved)
    if (resolved.source === 'unknown') stillUnknown.push(p.id as string)
  }
  // PO-line fallback only for the subset still unresolved after outlet/catalogue tiers — keeps the
  // common case (most products already have a catalogue or outlet cost) free of the extra query.
  if (stillUnknown.length) {
    const { data: lines } = await supabase.from('pos_purchase_order_lines')
      .select('product_id, confirmed_price, last_purchase_price, created_at')
      .eq('business_id', businessId).in('product_id', stillUnknown)
      .order('created_at', { ascending: false }).limit(5000)
    const latestByProduct = new Map<string, { confirmed_price?: unknown; last_purchase_price?: unknown }>()
    for (const l of lines ?? []) {
      const pid = l.product_id as string
      if (!latestByProduct.has(pid)) latestByProduct.set(pid, { confirmed_price: l.confirmed_price, last_purchase_price: l.last_purchase_price })
    }
    for (const pid of stillUnknown) {
      const line = latestByProduct.get(pid)
      if (!line) continue
      const resolved = resolveCost({ po_confirmed_price: line.confirmed_price, po_last_purchase_price: line.last_purchase_price })
      if (resolved.source !== 'unknown') out.set(pid, resolved)
    }

    // MS8 PHASE 2 — same dead-tier fix as latestPoLinePrice, on the batch path.
    // pos_purchase_order_lines holds 0 rows; the system's only recorded purchase costs are in
    // pos_purchase_order_items.unit_cost. Without this, the valuation panel's provenance chips
    // could never show 'purchase_order' for any product, however many POs had been received.
    // Only products STILL unknown after the lines pass are queried, so nothing already resolved
    // is overwritten and the extra query is skipped entirely when lines had data.
    const stillUnknownAfterLines = stillUnknown.filter(pid => (out.get(pid)?.source ?? 'unknown') === 'unknown')
    if (stillUnknownAfterLines.length) {
      const { data: items } = await supabase.from('pos_purchase_order_items')
        .select('product_id, unit_cost, pos_purchase_orders!inner(business_id, created_at)')
        .in('product_id', stillUnknownAfterLines)
        .eq('pos_purchase_orders.business_id', businessId)
        .order('created_at', { ascending: false, referencedTable: 'pos_purchase_orders' })
        .limit(5000)
      const latestItemByProduct = new Map<string, unknown>()
      for (const it of items ?? []) {
        const pid = it.product_id as string
        if (!latestItemByProduct.has(pid)) latestItemByProduct.set(pid, it.unit_cost)
      }
      for (const pid of stillUnknownAfterLines) {
        if (!latestItemByProduct.has(pid)) continue
        const resolved = resolveCost({ po_confirmed_price: latestItemByProduct.get(pid) })
        if (resolved.source !== 'unknown') out.set(pid, resolved)
      }
    }
  }
  return out
}

/**
 * CAPTURE-ON-RECEIVE — write the REAL receipt unit cost onto the per-outlet inventory row (item_cost =
 * current, last_item_cost = last delivery). Only ever writes a positive cost — a missing/zero receipt cost
 * is ignored (never overwrites a real cost with 0, never fabricates). No-op if the outlet row is absent.
 */
export async function captureReceiptCost(supabase: SupabaseClient, params: { businessId: string; outletId: string | null; productId: string; unitCost: number | null | undefined }): Promise<void> {
  const cost = pos(params.unitCost)
  if (cost == null || !params.outletId || !params.productId) return
  const { data: row } = await supabase.from('pos_outlet_inventory').select('id')
    .eq('business_id', params.businessId).eq('product_id', params.productId).eq('outlet_id', params.outletId).maybeSingle()
  if (!row?.id) return
  await supabase.from('pos_outlet_inventory').update({ item_cost: cost, last_item_cost: cost, updated_at: new Date().toISOString() }).eq('id', row.id)
}

/** Owner-facing "costs needed" — products whose cost resolves to unknown at this outlet. */
export async function listMissingCosts(supabase: SupabaseClient, businessId: string, outletId: string | null): Promise<Array<{ id: string; name: string; price: number }>> {
  const costs = await resolveCostBatch(supabase, businessId, outletId)
  const unknownIds = [...costs.entries()].filter(([, c]) => c.source === 'unknown').map(([id]) => id)
  if (!unknownIds.length) return []
  const { data: products } = await supabase.from('pos_products').select('id, name, price').in('id', unknownIds)
  return (products ?? []).map(p => ({ id: p.id as string, name: (p.name as string) ?? 'Unknown', price: Number(p.price) || 0 }))
}
