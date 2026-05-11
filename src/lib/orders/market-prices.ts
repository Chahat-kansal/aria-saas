import { createServerSupabaseClient } from '@/lib/supabase-server'

export interface MarketPriceResult {
  source_name: string
  source_url: string | null
  shelf_price: number
  fetched_at: string
  is_cached: boolean
  is_estimate: boolean
}

/**
 * Returns retail-price estimates from the business's own purchase history.
 * Liquor/FMCG retail marks up ~60% above wholesale; we use ×1.60 as midpoint.
 *
 * Previous implementation called Dan Murphy's / BWS APIs — blocked by anti-bot
 * measures. Local estimates are more reliable and honest.
 */
export async function fetchMarketPrices(
  productId: string,
  businessId: string,
  _barcode: string | null,
  _productName: string,
): Promise<MarketPriceResult[]> {
  try {
    const supabase = createServerSupabaseClient()

    const { data: history } = await supabase
      .from('pos_purchase_order_lines')
      .select('confirmed_price, created_at')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .not('confirmed_price', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (history && history.length > 0) {
      const lastPaid = history[0].confirmed_price as number
      return [{
        source_name: 'Industry estimate',
        source_url: null,
        shelf_price: lastPaid * 1.60,
        fetched_at: new Date().toISOString(),
        is_cached: false,
        is_estimate: true,
      }]
    }

    const { data: inv } = await supabase
      .from('pos_outlet_inventory')
      .select('last_case_cost, items_per_case')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .not('last_case_cost', 'is', null)
      .limit(1)
      .maybeSingle()

    if (!inv?.last_case_cost) return []

    const perItem = inv.items_per_case
      ? (inv.last_case_cost as number) / (inv.items_per_case as number)
      : (inv.last_case_cost as number)

    return [{
      source_name: 'Industry estimate',
      source_url: null,
      shelf_price: perItem * 1.60,
      fetched_at: new Date().toISOString(),
      is_cached: false,
      is_estimate: true,
    }]
  } catch (err) {
    console.warn('[market-prices] failed:', err)
    return []
  }
}

export async function getPurchaseHistory(
  productId: string,
  businessId: string,
  limit = 5,
) {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('pos_purchase_order_lines')
    .select('confirmed_price, created_at, supplier_name')
    .eq('product_id', productId)
    .eq('business_id', businessId)
    .not('confirmed_price', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map(d => ({
    price: d.confirmed_price as number,
    date: d.created_at as string,
    supplier: d.supplier_name as string | null,
  }))
}
