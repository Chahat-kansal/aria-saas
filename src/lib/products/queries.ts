import type { Outlet, PriceSet, ProductPrice, OutletInventory, ProductBarcode, ProductLoyalty, ProductImage, ProductWithFullDetail } from './types'

type SupabaseClient = ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>

export async function getOutlets(supabase: SupabaseClient, businessId: string): Promise<Outlet[]> {
  const { data } = await supabase
    .from('pos_outlets')
    .select('*')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('is_global', { ascending: false })
    .order('is_default', { ascending: false })
    .order('name')
  return (data ?? []) as Outlet[]
}

export async function getPriceSets(supabase: SupabaseClient, businessId: string): Promise<PriceSet[]> {
  const { data } = await supabase
    .from('pos_price_sets')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order')
    .order('name')
  return (data ?? []) as PriceSet[]
}

export async function getProductWithFullDetail(
  supabase: SupabaseClient,
  productId: string,
  businessId: string
): Promise<ProductWithFullDetail | null> {
  const [productRes, pricesRes, inventoryRes, barcodesRes, loyaltyRes, imagesRes] = await Promise.all([
    supabase
      .from('pos_products')
      .select('*')
      .eq('id', productId)
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('pos_product_prices')
      .select('*')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .order('outlet_id', { ascending: true, nullsFirst: true })
      .order('quantity'),
    supabase
      .from('pos_outlet_inventory')
      .select('*')
      .eq('product_id', productId)
      .eq('business_id', businessId),
    supabase
      .from('pos_product_barcodes')
      .select('*')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .order('is_primary', { ascending: false }),
    supabase
      .from('pos_product_loyalty')
      .select('*')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('pos_product_images')
      .select('*')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .order('is_primary', { ascending: false })
      .order('sort_order'),
  ])

  if (!productRes.data) return null

  return {
    product: productRes.data as Record<string, unknown>,
    prices: (pricesRes.data ?? []) as ProductPrice[],
    inventory: (inventoryRes.data ?? []) as OutletInventory[],
    barcodes: (barcodesRes.data ?? []) as ProductBarcode[],
    loyalty: (loyaltyRes.data ?? null) as ProductLoyalty | null,
    images: (imagesRes.data ?? []) as ProductImage[],
  }
}

/**
 * Effective price resolution order:
 * 1. Outlet-specific row matching quantity exactly
 * 2. Outlet-specific row with quantity = 1
 * 3. Global (outlet_id IS NULL) row matching quantity exactly
 * 4. Global row with quantity = 1
 * 5. Fallback: pos_products.price
 */
export async function getEffectivePrice(
  supabase: SupabaseClient,
  productId: string,
  outletId: string,
  quantity: number,
  priceSetId: string
): Promise<number> {
  const { data: prices } = await supabase
    .from('pos_product_prices')
    .select('outlet_id, quantity, price')
    .eq('product_id', productId)
    .eq('price_set_id', priceSetId)
    .or(`outlet_id.eq.${outletId},outlet_id.is.null`)
    .order('outlet_id', { ascending: false, nullsFirst: false }) // outlet-specific first
    .order('quantity', { ascending: true })

  if (!prices?.length) {
    // Final fallback: base product price
    const { data: product } = await supabase
      .from('pos_products')
      .select('price')
      .eq('id', productId)
      .maybeSingle()
    return (product as { price?: number } | null)?.price ?? 0
  }

  const rows = prices as { outlet_id: string | null; quantity: number; price: number }[]

  // Priority order
  const checks: Array<(r: typeof rows[0]) => boolean> = [
    r => r.outlet_id === outletId && r.quantity === quantity,
    r => r.outlet_id === outletId && r.quantity === 1,
    r => r.outlet_id === null && r.quantity === quantity,
    r => r.outlet_id === null && r.quantity === 1,
  ]

  for (const check of checks) {
    const match = rows.find(check)
    if (match) return match.price
  }

  // Fallback: first available price
  return rows[0].price
}
