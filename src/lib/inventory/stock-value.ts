import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCost, type ResolvedCost, type CostSource } from '@/lib/inventory/resolve-cost'

export interface StockValueRow {
  id: string
  name: string
  units: number
  unit_cost: number | null     // resolved cost (null = unknown)
  cost_source: CostSource      // provenance: outlet | last_delivery | catalogue | unknown
  value_at_cost: number | null // units × unit_cost (null when cost unknown)
  price: number
  value_at_retail: number      // units × price
  margin_pct: number | null    // (price − cost) / price, null when unknown
}

// INV-COST-1 — value the on-hand stock at cost and at retail. GROUNDING-TEETH: products whose cost is
// unknown are EXCLUDED from the at-cost total and COUNTED separately ("X of N products have no cost —
// value incomplete"). Unknown cost is never treated as $0. Retail value uses pos_products.price for all
// products (price is NOT NULL). Per outlet; sum across the outlet's on-hand rows.

export interface StockValuation {
  outlet_id: string | null
  at_cost: number              // dollars — on-hand value at resolved cost (known-cost products only)
  at_retail: number            // dollars — on-hand value at selling price (all products)
  products_total: number       // products with on-hand stock at this outlet
  products_valued: number      // …of those, with a known cost (in the at_cost total)
  products_unknown_cost: number // …with stock but no resolvable cost (excluded from at_cost)
  units_on_hand: number
  unknown_cost_products: Array<{ id: string; name: string; units: number }>
  margin_incomplete: boolean   // true when any on-hand product lacks a cost
  margin_pct: number | null    // blended (at_retail − at_cost) / at_retail over costed stock; null if none costed
  products: StockValueRow[]    // per-product breakdown, ranked by on-hand value (costed first, then retail)
}

interface Row {
  product_id: string
  items_on_hand: number | null
  item_cost: number | null
  last_item_cost: number | null
  pos_products: { name: string | null; price: number | null; cost_price: number | null } | null
}

/** Value all on-hand stock at an outlet (items_on_hand × resolved cost / price). */
export async function computeStockValue(supabase: SupabaseClient, businessId: string, outletId: string | null): Promise<StockValuation> {
  let q = supabase.from('pos_outlet_inventory')
    .select('product_id, items_on_hand, item_cost, last_item_cost, pos_products(name, price, cost_price)')
    .eq('business_id', businessId).gt('items_on_hand', 0).limit(10000)
  if (outletId) q = q.eq('outlet_id', outletId)
  const { data } = await q
  const rows = (data ?? []) as unknown as Row[]

  let atCost = 0, atRetail = 0, valued = 0, unknown = 0, units = 0
  const unknownProducts: StockValuation['unknown_cost_products'] = []
  const products: StockValueRow[] = []

  for (const r of rows) {
    const onHand = Number(r.items_on_hand) || 0
    if (onHand <= 0) continue
    units += onHand
    const price = Number(r.pos_products?.price) || 0
    const retailVal = Math.round(onHand * price * 100) / 100
    atRetail += onHand * price

    const resolved: ResolvedCost = resolveCost({ item_cost: r.item_cost, last_item_cost: r.last_item_cost, cost_price: r.pos_products?.cost_price })
    const name = r.pos_products?.name ?? 'Unknown'
    if (resolved.cost != null) {
      atCost += onHand * resolved.cost
      valued++
      products.push({
        id: r.product_id, name, units: onHand, unit_cost: resolved.cost, cost_source: resolved.source,
        value_at_cost: Math.round(onHand * resolved.cost * 100) / 100, price, value_at_retail: retailVal,
        margin_pct: price > 0 ? Math.round(((price - resolved.cost) / price) * 1000) / 10 : null,
      })
    } else {
      unknown++
      unknownProducts.push({ id: r.product_id, name, units: onHand })
      products.push({
        id: r.product_id, name, units: onHand, unit_cost: null, cost_source: 'unknown',
        value_at_cost: null, price, value_at_retail: retailVal, margin_pct: null,
      })
    }
  }

  // Rank: costed products by value (desc) first, then unknown-cost by retail value (desc).
  products.sort((a, b) => {
    const av = a.value_at_cost, bv = b.value_at_cost
    if (av != null && bv != null) return bv - av
    if (av != null) return -1
    if (bv != null) return 1
    return b.value_at_retail - a.value_at_retail
  })

  const atCostR = Math.round(atCost * 100) / 100
  const atRetailR = Math.round(atRetail * 100) / 100
  // Blended margin over the COSTED portion only (so it's a real number, never inflated by unknowns).
  const costedRetail = products.filter(p => p.unit_cost != null).reduce((s, p) => s + p.value_at_retail, 0)
  const marginPct = costedRetail > 0 ? Math.round(((costedRetail - atCostR) / costedRetail) * 1000) / 10 : null

  return {
    outlet_id: outletId,
    at_cost: atCostR,
    at_retail: atRetailR,
    products_total: rows.length,
    products_valued: valued,
    products_unknown_cost: unknown,
    units_on_hand: units,
    unknown_cost_products: unknownProducts,
    margin_incomplete: unknown > 0,
    margin_pct: marginPct,
    products,
  }
}
