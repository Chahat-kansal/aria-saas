import { resolveCostFor } from '@/lib/inventory/resolve-cost'

type SB = ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>

/**
 * Resolves the best available unit cost for a product in this order:
 * 1. Market price (open_market_low) if available and > 0
 * 2. Last purchase price passed in from caller
 * 3. Product cost_price passed in from caller
 * 4. The canonical resolver (resolve-cost.ts): outlet item_cost → last_item_cost →
 *    purchase-order confirmed/last price → pos_products.cost_price
 * 5. 0 only if nothing else available — never crashes, never fabricates
 *
 * INTEL-COMPUTE-1 — this used to fall back to `price * 0.6` (a fabricated 40%-margin guess) between
 * tiers 4 and 5, contradicting resolve-cost.ts's own "never fabricate" contract one directory over.
 * Tier 4 now delegates to that canonical resolver instead of re-querying pos_purchase_order_lines/
 * pos_products independently, so there is exactly one place PO-history cost resolution happens.
 */
export async function resolveUnitCost(
  supabase: SB,
  productId: string,
  businessId: string,
  options?: {
    marketPriceLow?:     number | null
    lastPurchasePrice?:  number | null
    productCostPrice?:   number | null
    productSalePrice?:   number | null
  }
): Promise<number> {
  const o = options ?? {}

  // 1. Market price
  if (o.marketPriceLow && o.marketPriceLow > 0) return o.marketPriceLow

  // 2. Last purchase price passed in
  if (o.lastPurchasePrice && o.lastPurchasePrice > 0) return o.lastPurchasePrice

  // 3. Product cost_price passed in
  if (o.productCostPrice && o.productCostPrice > 0) return o.productCostPrice

  // 4. Canonical resolver — outlet cost, PO history, catalogue cost_price, in that order
  try {
    const resolved = await resolveCostFor(supabase, businessId, productId, null)
    if (resolved.cost != null) return resolved.cost
  } catch (e) { console.error('[non-fatal]', e) }

  // 5. Nothing resolvable anywhere — 0, not a fabricated estimate
  return 0
}

export function calcLineTotalCents(unitCost: number, quantity: number): number {
  return Math.round(unitCost * quantity * 100)
}

export function formatOrderCost(
  unitCost: number,
  isMarketPrice: boolean
): { display: string; isEstimate: boolean } {
  return {
    display: `A$${unitCost.toFixed(2)}`,
    isEstimate: !isMarketPrice,
  }
}