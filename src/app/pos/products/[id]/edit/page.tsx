import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import ProductEditShell from '@/components/products/edit/ProductEditShell'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const bid = await getBid(supabase, user.id)
  if (!bid) notFound()

  const [
    productRes, pricesRes, inventoryRes, barcodesRes, loyaltyRes, imagesRes,
    outletsRes, priceSetsRes, categoriesRes, brandsRes, familiesRes, suppliersRes,
  ] = await Promise.all([
    supabase.from('pos_products').select('*').eq('id', id).eq('business_id', bid).maybeSingle(),
    supabase.from('pos_product_prices').select('*').eq('product_id', id).eq('business_id', bid).order('quantity'),
    supabase.from('pos_outlet_inventory').select('*').eq('product_id', id).eq('business_id', bid),
    supabase.from('pos_product_barcodes').select('*').eq('product_id', id).eq('business_id', bid).order('is_primary', { ascending: false }),
    supabase.from('pos_product_loyalty').select('*').eq('product_id', id).eq('business_id', bid).maybeSingle(),
    supabase.from('pos_product_images').select('*').eq('product_id', id).eq('business_id', bid).order('sort_order'),
    supabase.from('pos_outlets').select('id,name,is_global,is_default,code').eq('business_id', bid).order('is_global', { ascending: false }).order('name'),
    supabase.from('pos_price_sets').select('*').eq('business_id', bid).order('sort_order'),
    supabase.from('pos_categories').select('id,name,color').eq('business_id', bid).order('name'),
    supabase.from('pos_brands').select('id,name').eq('business_id', bid).order('name'),
    supabase.from('pos_families').select('id,name').eq('business_id', bid).order('name'),
    supabase.from('pos_suppliers').select('id,name').eq('business_id', bid).order('name'),
  ])

  if (!productRes.data) notFound()

  // pos_product_suppliers may not exist yet — graceful fallback
  let productSuppliers: any[] = []
  try {
    const { data } = await supabase.from('pos_product_suppliers').select('*').eq('product_id', id).eq('business_id', bid)
    productSuppliers = data ?? []
  } catch { /* table not yet migrated */ }

  return (
    <ProductEditShell
      product={productRes.data as any}
      prices={(pricesRes.data ?? []) as any[]}
      inventory={(inventoryRes.data ?? []) as any[]}
      barcodes={(barcodesRes.data ?? []) as any[]}
      loyalty={(loyaltyRes.data ?? null) as any}
      images={(imagesRes.data ?? []) as any[]}
      outlets={(outletsRes.data ?? []) as any[]}
      priceSets={(priceSetsRes.data ?? []) as any[]}
      categories={(categoriesRes.data ?? []) as any[]}
      brands={(brandsRes.data ?? []) as any[]}
      families={(familiesRes.data ?? []) as any[]}
      suppliers={(suppliersRes.data ?? []) as any[]}
      productSuppliers={productSuppliers}
    />
  )
}
