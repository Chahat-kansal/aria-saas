import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCostBatch, looksBackCalculatedCost, type ResolvedCost, type CostSource } from '@/lib/inventory/resolve-cost'
import type { Grounding } from '@/lib/aria/compute/provenance'

export interface StockValueRow {
  id: string
  name: string
  units: number
  unit_cost: number | null     // resolved cost (null = unknown)
  cost_source: CostSource      // provenance: outlet | last_delivery | catalogue | unknown
  cost_grounding: Grounding | null // INTEL-TRUTH-1 — Business Truth type of unit_cost; null when unknown
  /** MS9 PHASE 3 — the stored catalogue cost_price matches price × 0.4 to the cent: it looks
   *  back-calculated from the price, not recorded from a purchase. Disclosure only. Flagged on the
   *  STORED figure regardless of which tier won resolution, so a product now costed from a PO still
   *  tells the owner its catalogue entry is fabricated-looking. */
  cost_price_suspect: boolean
  value_at_cost: number | null // units × unit_cost (null when cost unknown)
  price: number
  value_at_retail: number      // units × price
  margin_pct: number | null    // (price − cost) / price, null when unknown
  margin_grounding: Grounding | null // INTEL-TRUTH-1 — always 'derived' when margin_pct is present (a
                                      // computed ratio, even over a verified cost); null when unknown
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
  margin_grounding: Grounding | null // INTEL-TRUTH-1 — always 'derived' when margin_pct is present
  at_cost_grounding: Grounding | null // INTEL-TRUTH-1 — worst (least-grounded) tier across all costed
                                       // products; a sum is only as trustworthy as its weakest input.
                                       // null when no product on hand has a resolvable cost at all.
  products: StockValueRow[]    // per-product breakdown, ranked by on-hand value (costed first, then retail)
}

// INTEL-TRUTH-1 — 'estimated' is weaker than 'derived' is weaker than 'verified'. Used to fold a set
// of per-item groundings into one honest aggregate grounding for a sum/total.
const WEAKNESS: Record<Grounding, number> = { verified: 0, derived: 1, estimated: 2 }
function worstGrounding(groundings: Array<Grounding | null>): Grounding | null {
  const real = groundings.filter((g): g is Grounding => g != null)
  if (real.length === 0) return null
  return real.reduce((worst, g) => (WEAKNESS[g] > WEAKNESS[worst] ? g : worst))
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

  // MS9 PHASE 2 — resolution goes through the canonical batch orchestrator, not a private inline
  // resolveCost() over this query's own columns. The inline call carried the exact gating bug
  // phase 1 fixed elsewhere: it never fetched a purchase-order price, so a product whose real cost
  // lives on a PO (Cortado, Turmeric Latte) valued at the fabricated catalogue figure here while
  // every other resolver-backed surface showed the corrected one. One orchestrator, one answer.
  const costMap = await resolveCostBatch(supabase, businessId, outletId)

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

    const resolved: ResolvedCost = costMap.get(r.product_id) ?? { cost: null, source: 'unknown', grounding: null }
    const name = r.pos_products?.name ?? 'Unknown'
    if (resolved.cost != null) {
      atCost += onHand * resolved.cost
      valued++
      products.push({
        id: r.product_id, name, units: onHand, unit_cost: resolved.cost, cost_source: resolved.source,
        cost_grounding: resolved.grounding,
        cost_price_suspect: looksBackCalculatedCost(r.pos_products?.price, r.pos_products?.cost_price),
        value_at_cost: Math.round(onHand * resolved.cost * 100) / 100, price, value_at_retail: retailVal,
        margin_pct: price > 0 ? Math.round(((price - resolved.cost) / price) * 1000) / 10 : null,
        // INTEL-TRUTH-1 — a margin is only as trustworthy as the cost it's computed over: folding in
        // resolved.grounding (not just a bare 'derived') means a margin over a catalogue-tier
        // (estimated) cost is itself reported as estimated, not falsely upgraded to derived.
        margin_grounding: price > 0 ? worstGrounding([resolved.grounding, 'derived']) : null,
      })
    } else {
      unknown++
      unknownProducts.push({ id: r.product_id, name, units: onHand })
      products.push({
        id: r.product_id, name, units: onHand, unit_cost: null, cost_source: 'unknown', cost_grounding: null,
        cost_price_suspect: false,
        value_at_cost: null, price, value_at_retail: retailVal, margin_pct: null, margin_grounding: null,
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
  const atCostGrounding = worstGrounding(products.map(p => p.cost_grounding))

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
    // INTEL-TRUTH-1 — same reasoning as the per-row fix above: the blended margin is only as
    // trustworthy as at_cost's own weakest input, not unconditionally 'derived'.
    margin_grounding: marginPct != null ? worstGrounding([atCostGrounding, 'derived']) : null,
    at_cost_grounding: atCostGrounding,
    products,
  }
}
