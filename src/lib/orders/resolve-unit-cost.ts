type SB = ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>

/**
 * Resolves the best available unit cost for a product in this order:
 * 1. Market price (open_market_low) if available and > 0
 * 2. Last purchase price passed in from caller
 * 3. Product cost_price from pos_products (passed in or fetched)
 * 4. Product price * 0.6 (estimated 40% margin) as last resort
 * 5. 0 only if nothing else available — never crashes
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

  // 4. Fetch from DB
  try {
    const { data: lastLine } = await supabase
      .from('pos_purchase_order_lines')
      .select('confirmed_price, last_purchase_price')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .not('confirmed_price', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastLine?.confirmed_price && (lastLine.confirmed_price as number) > 0) {
      return lastLine.confirmed_price as number
    }
    if (lastLine?.last_purchase_price && (lastLine.last_purchase_price as number) > 0) {
      return lastLine.last_purchase_price as number
    }

    const { data: product } = await supabase
      .from('pos_products')
      .select('cost_price, price')
      .eq('id', productId)
      .maybeSingle()

    if (product?.cost_price && (product.cost_price as number) > 0) {
      return product.cost_price as number
    }
    if (product?.price && (product.price as number) > 0) {
      return (product.price as number) * 0.6
    }
  } catch (e) { console.error('[non-fatal]', e) }

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