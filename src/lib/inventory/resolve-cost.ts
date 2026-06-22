import type { SupabaseClient } from '@supabase/supabase-js'

// INV-COST-1 — one trustworthy "current unit cost" per (product, outlet). GROUNDING-TEETH: a cost is only
// ever a REAL number from one of the known sources; an absent/zero cost is reported as `unknown` (NULL),
// never silently treated as 0 and never fabricated. The resolver returns its provenance so the UI/AI can
// say where the number came from ("from last delivery" vs "catalogue" vs "unknown").
//
// Resolution order (documented + locked):
//   1. pos_outlet_inventory.item_cost      (per-outlet actual)       if > 0
//   2. pos_outlet_inventory.last_item_cost (per-outlet last receipt) if > 0
//   3. pos_products.cost_price             (business-level catalogue) if > 0
//   4. else NULL → 'unknown'

// Provenance labels are owner-facing: 'outlet' (per-outlet actual item_cost), 'last_delivery'
// (last receipt cost), 'catalogue' (business-level cost_price), 'unknown' (no resolvable cost).
export type CostSource = 'outlet' | 'last_delivery' | 'catalogue' | 'unknown'
export interface ResolvedCost { cost: number | null; source: CostSource }

function pos(n: unknown): number | null {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : null
}

/** Pure resolver over already-fetched values. */
export function resolveCost(input: { item_cost?: unknown; last_item_cost?: unknown; cost_price?: unknown }): ResolvedCost {
  const ic = pos(input.item_cost)
  if (ic != null) return { cost: ic, source: 'outlet' }
  const lic = pos(input.last_item_cost)
  if (lic != null) return { cost: lic, source: 'last_delivery' }
  const cp = pos(input.cost_price)
  if (cp != null) return { cost: cp, source: 'catalogue' }
  return { cost: null, source: 'unknown' }
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
  return resolveCost({ item_cost: oi.item_cost, last_item_cost: oi.last_item_cost, cost_price: prod?.cost_price })
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
  for (const p of products ?? []) {
    const oi = oiMap.get(p.id as string) ?? {}
    out.set(p.id as string, resolveCost({ item_cost: oi.item_cost, last_item_cost: oi.last_item_cost, cost_price: p.cost_price }))
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
