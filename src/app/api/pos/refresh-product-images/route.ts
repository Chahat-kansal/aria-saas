export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function fetchUnsplashUrl(query: string, accessKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=squarish&content_filter=high`,
      { headers: { Authorization: `Client-ID ${accessKey}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const photo = data.results?.[0]
    return photo?.urls?.small ?? photo?.urls?.regular ?? null
  } catch {
    return null
  }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) {
    return NextResponse.json({ error: 'UNSPLASH_ACCESS_KEY not configured' }, { status: 500 })
  }

  // Resolve business
  const body = await req.json().catch(() => ({}))
  let bid = body.business_id as string | undefined
  if (!bid) {
    const { data: active } = await supabase
      .from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
    bid = active?.business_id
  }
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  // Verify ownership
  const { data: biz } = await supabase
    .from('businesses').select('id, industry').eq('id', bid).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch all products for this business — include category name for better image queries
  const { data: products } = await supabase
    .from('pos_products')
    .select('id, name, category_id, pos_categories(name)')
    .eq('business_id', bid)
    .eq('is_active', true)

  if (!products?.length) return NextResponse.json({ updated: 0 })

  const INDUSTRY_HINTS: Record<string, string> = {
    liquor: 'bottle alcohol drink',
    cafe: 'cafe coffee beverage',
    bakery: 'bakery fresh',
    restaurant: 'restaurant dish meal',
    retail: 'retail product',
    pharmacy: 'pharmacy health',
    convenience: 'convenience store',
    fashion: 'clothing apparel',
  }
  const industryHint = INDUSTRY_HINTS[(biz.industry as string) ?? 'retail'] ?? 'product'

  let updated = 0
  // Process in batches of 5 to respect rate limits
  const batchSize = 5
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async p => {
        const catName = (p as any).pos_categories?.name ?? ''
        const query = catName ? `${p.name} ${catName}` : `${p.name} ${industryHint}`
        const url = await fetchUnsplashUrl(query, accessKey)
        return { id: p.id, url }
      })
    )
    for (const { id, url } of results) {
      if (url) {
        await supabase
          .from('pos_products')
          .update({ image_url: url, image_source: 'owner' })
          .eq('id', id)
          .eq('business_id', bid)
        updated++
      }
    }
    // Small pause between batches to be kind to the API
    if (i + batchSize < products.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return NextResponse.json({ ok: true, updated, total: products.length })
}

export const POST = withErrorCapture('pos/refresh-product-images', _POST)