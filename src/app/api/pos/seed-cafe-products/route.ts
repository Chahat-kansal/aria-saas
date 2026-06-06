export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { CAFE_SEED_PRODUCTS, CAFE_CATEGORIES } from '@/lib/pos/cafe-seed-products'
import { getCafeProductImage } from '@/lib/pos/cafe-image-map'

const CATEGORY_COLORS: Record<string, string> = {
  'Coffee':     '#6F4E37',
  'Tea':        '#7FB897',
  'Hot Drinks': '#D4956A',
  'Cold Drinks':'#4A9EBA',
  'Breakfast':  '#F59E0B',
  'Lunch':      '#10B981',
  'Bakery':     '#F97316',
  'Extras':     '#8B5CF6',
  'Kids':       '#EC4899',
}

async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve active business
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!active?.business_id) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, industry, name')
    .eq('id', active.business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  if ((biz as any).industry !== 'cafe') {
    return NextResponse.json(
      { error: 'Only available for cafe businesses' },
      { status: 400 }
    )
  }

  // Guard: skip if products already exist
  const { count } = await supabase
    .from('pos_products')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', biz.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Products already exist', count }, { status: 409 })
  }

  // Seed categories
  const categoryMap: Record<string, string> = {}
  for (const catName of CAFE_CATEGORIES) {
    const { data: cat } = await supabase
      .from('pos_categories')
      .upsert(
        { business_id: biz.id, name: catName, color: CATEGORY_COLORS[catName] ?? '#6B7280' },
        { onConflict: 'business_id,name' }
      )
      .select('id')
      .single()
    if (cat) categoryMap[catName] = cat.id
  }

  // Seed products in batches of 20
  const products = CAFE_SEED_PRODUCTS.map(p => ({
    business_id:    biz.id,
    name:           p.name,
    category_id:    categoryMap[p.category] ?? null,
    price:          p.price,
    cost_price:     p.cost_price,
    description:    p.description ?? null,
    image_url:      p.image_url ?? null,
    image_source:   p.image_url ? 'owner' : 'pending',
    stock_quantity: 999,
    track_stock:    false,
    is_active:      true,
  }))

  let inserted = 0
  const batchSize = 20
  for (let i = 0; i < products.length; i += batchSize) {
    const { data, error } = await supabase
      .from('pos_products')
      .insert(products.slice(i, i + batchSize))
      .select('id')
    if (!error && data) inserted += data.length
  }

  // Create outlet inventory records
  const { data: outlets } = await supabase
    .from('pos_outlets')
    .select('id')
    .eq('business_id', biz.id)

  const fetchAllProducts = async () => {
    const { data } = await supabase
      .from('pos_products')
      .select('id')
      .eq('business_id', biz.id)
    return data ?? []
  }

  if (!outlets?.length) {
    const { data: newOutlet } = await supabase
      .from('pos_outlets')
      .insert({
        business_id: biz.id,
        name: 'Main Store',
        code: 'MAIN',
        is_default: true,
        is_active: true,
        active: true,
      })
      .select('id')
      .single()

    if (newOutlet) {
      const allProducts = await fetchAllProducts()
      if (allProducts.length) {
        await supabase.from('pos_outlet_inventory').insert(
          allProducts.map(p => ({
            business_id: biz.id,
            product_id: p.id,
            outlet_id: newOutlet.id,
          }))
        )
      }
    }
  } else {
    const allProducts = await fetchAllProducts()
    if (allProducts.length) {
      await supabase.from('pos_outlet_inventory').upsert(
        allProducts.flatMap(p =>
          outlets.map(o => ({
            business_id: biz.id,
            product_id: p.id,
            outlet_id: o.id,
          }))
        ),
        { onConflict: 'product_id,outlet_id' }
      )
    }
  }

  // Kick off image refresh in background (non-blocking — best effort)
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (accessKey) {
    const { data: allProds } = await supabase
      .from('pos_products').select('id, name').eq('business_id', biz.id).eq('is_active', true)
    if (allProds?.length) {
      void Promise.all(
        allProds.map(async p => {
          try {
            const res = await fetch(
              `https://api.unsplash.com/search/photos?query=${encodeURIComponent(p.name + ' cafe food')}&per_page=1&orientation=squarish&content_filter=high`,
              { headers: { Authorization: `Client-ID ${accessKey}` } }
            )
            if (!res.ok) return
            const d = await res.json()
            const url = d.results?.[0]?.urls?.small ?? d.results?.[0]?.urls?.regular
            if (url) {
              await supabase.from('pos_products')
                .update({ image_url: url, image_source: 'owner' })
                .eq('id', p.id).eq('business_id', biz.id)
            }
          } catch (e) { console.error('[non-fatal]', e) }
        })
      )
    }
  }

  return NextResponse.json({ ok: true, seeded: inserted })
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const businessId = active?.business_id
  if (!businessId) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: products } = await supabase
    .from('pos_products').select('id, name').eq('business_id', businessId)

  let updated = 0
  for (const product of products ?? []) {
    const imageUrl = getCafeProductImage(product.name)
    if (imageUrl) {
      await supabase.from('pos_products')
        .update({ image_url: imageUrl, image_source: 'owner' }).eq('id', product.id)
      updated++
    }
  }
  return NextResponse.json({ ok: true, updated })
}

export const GET = withErrorCapture('pos/seed-cafe-products', _GET)
export const POST = withErrorCapture('pos/seed-cafe-products', _POST)