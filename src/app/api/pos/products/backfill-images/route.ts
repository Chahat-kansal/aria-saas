export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { autoFetchProductImage } from '@/lib/pos/auto-fetch-image'

async function _POST(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!active?.business_id) return NextResponse.json({ error: 'No active business' }, { status: 404 })

  const { data: business } = await supabase
    .from('businesses')
    .select('industry')
    .eq('id', active.business_id)
    .eq('user_id', user.id)
    .single()
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: products } = await supabase
    .from('pos_products')
    .select('id, name')
    .eq('business_id', active.business_id)
    .is('image_url', null)

  if (!products || products.length === 0) {
    return NextResponse.json({ ok: true, queued: 0, message: 'All products already have images' })
  }

  for (const p of products) {
    autoFetchProductImage({ productId: p.id, productName: p.name, industry: business.industry, businessId: active.business_id })
  }

  return NextResponse.json({
    ok: true,
    queued: products.length,
    message: `Fetching images for ${products.length} products in background`,
  })
}

export const POST = withErrorCapture('pos/products/backfill-images', _POST)