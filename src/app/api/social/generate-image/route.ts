export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Industry-aware search term enhancement for beautiful, relevant images
const INDUSTRY_IMAGE_STYLE: Record<string, string> = {
  cafe: 'coffee latte art cafe beautiful',
  restaurant: 'restaurant food plating beautiful',
  bakery: 'bakery pastry beautiful fresh',
  bar: 'cocktail bar drinks beautiful',
  retail: 'retail shop product beautiful',
  liquor: 'wine spirits bottles premium',
  convenience: 'store products fresh',
}

// Curated Unsplash collection IDs for beautiful food/cafe photography
const UNSPLASH_COLLECTIONS: Record<string, string> = {
  cafe: '1126606',        // Coffee & Cafes — stunning latte art, barista shots
  coffee: '1126606',
  latte: '1126606',
  food: '3330448',        // Food Photography — beautiful plating
  restaurant: '3330448',
  pastry: '9265870',      // Bakery & Pastry
  cake: '9265870',
  cocktail: '6993209',    // Drinks & Cocktails
  drink: '6993209',
  beer: '6993209',
  wine: '6993209',
  smoothie: '3330448',
  breakfast: '3330448',
  brunch: '3330448',
  default: '1126606',
}

function getCollectionId(query: string): string {
  const q = query.toLowerCase()
  for (const [keyword, id] of Object.entries(UNSPLASH_COLLECTIONS)) {
    if (q.includes(keyword)) return id
  }
  return UNSPLASH_COLLECTIONS.default
}

function enhanceQuery(query: string, industry?: string): string {
  // Remove generic words that produce bad results
  const cleaned = query
    .replace(/\b(australian|australia|local|our|the|this|a|an)\b/gi, '')
    .replace(/\s+/g, ' ').trim()
  
  const style = industry ? (INDUSTRY_IMAGE_STYLE[industry] ?? '') : ''
  
  // Build a focused, beautiful-image-oriented query
  const terms = [cleaned, style].filter(Boolean).join(' ')
  return terms.slice(0, 100)
}

async function tryPexels(query: string, industry?: string): Promise<{ url: string; credit: string } | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null
  try {
    const enhanced = enhanceQuery(query, industry)
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(enhanced)}&per_page=5&orientation=square`,
      { headers: { Authorization: key } }
    )
    if (!res.ok) return null
    const d = await res.json() as { photos?: Array<{ src?: { large?: string; medium?: string }; photographer?: string }> }
    // Skip first result (often too generic), take second or third
    const photo = d.photos?.[1] ?? d.photos?.[0]
    if (!photo?.src?.large && !photo?.src?.medium) return null
    return { url: photo.src.large ?? photo.src.medium!, credit: `${photo.photographer ?? 'Pexels'} on Pexels` }
  } catch { return null }
}

async function tryUnsplashAPI(query: string, industry?: string): Promise<{ url: string; credit: string } | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return null
  try {
    const enhanced = enhanceQuery(query, industry)
    const collectionId = getCollectionId(query)
    // Search within curated collections for better quality
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(enhanced)}&collections=${collectionId}&per_page=5&orientation=square&order_by=relevant`,
      { headers: { Authorization: `Client-ID ${key}` } }
    )
    if (!res.ok) return null
    const d = await res.json() as { results?: Array<{ urls?: { regular?: string; small?: string }; user?: { name?: string } }> }
    // Pick second result (first is often too generic)
    const photo = d.results?.[1] ?? d.results?.[0]
    if (!photo?.urls?.regular) return null
    return { url: photo.urls.regular, credit: photo.user?.name ?? 'Unsplash' }
  } catch { return null }
}

async function tryPixabay(query: string, industry?: string): Promise<{ url: string; credit: string } | null> {
  const key = process.env.PIXABAY_API_KEY
  if (!key) return null
  try {
    const enhanced = enhanceQuery(query, industry)
    const res = await fetch(
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(enhanced)}&image_type=photo&orientation=horizontal&per_page=5&safesearch=true&min_width=800&editors_choice=true`
    )
    const d = await res.json() as { hits?: Array<{ webformatURL?: string; largeImageURL?: string }> }
    // editors_choice=true filters to only high-quality curated images
    const hit = d.hits?.[0]
    if (!hit?.largeImageURL && !hit?.webformatURL) return null
    return { url: hit.largeImageURL ?? hit.webformatURL!, credit: 'Pixabay' }
  } catch { return null }
}

async function tryPixabayFallback(query: string, industry?: string): Promise<{ url: string; credit: string } | null> {
  // Second attempt without editors_choice restriction
  const key = process.env.PIXABAY_API_KEY
  if (!key) return null
  try {
    const enhanced = enhanceQuery(query, industry)
    const res = await fetch(
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(enhanced)}&image_type=photo&orientation=horizontal&per_page=5&safesearch=true&min_width=1200`
    )
    const d = await res.json() as { hits?: Array<{ webformatURL?: string; largeImageURL?: string }> }
    const hit = d.hits?.[1] ?? d.hits?.[0] // skip first which can be generic
    if (!hit?.largeImageURL && !hit?.webformatURL) return null
    return { url: hit.largeImageURL ?? hit.webformatURL!, credit: 'Pixabay' }
  } catch { return null }
}

async function tryStabilityAI(prompt: string): Promise<string | null> {
  const key = process.env.STABILITY_AI_KEY
  if (!key) return null
  try {
    const enhancedPrompt = `${prompt}, professional food photography, beautiful composition, warm lighting, bokeh background, Instagram worthy, high quality, 4K`
    const res = await fetch(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          text_prompts: [
            { text: enhancedPrompt, weight: 1 },
            { text: 'blurry, ugly, low quality, watermark, text, logo, generic, stock photo', weight: -1 },
          ],
          cfg_scale: 8, height: 1024, width: 1024, steps: 35, samples: 1,
        }),
      }
    )
    if (!res.ok) return null
    const d = await res.json() as { artifacts?: Array<{ base64?: string }> }
    const b64 = d.artifacts?.[0]?.base64
    if (!b64) return null
    // Upload to Supabase storage
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const buf = Buffer.from(b64, 'base64')
    const path = `social/generated/${Date.now()}_sdxl.png`
    const { error } = await supabaseAdmin.storage.from('media').upload(path, buf, { contentType: 'image/png', upsert: true })
    if (error) return null
    return supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl
  } catch { return null }
}

async function _POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    // Allow internal server-to-server calls (from social-suggest async job)
    const isInternal = (req as Request).headers.get('x-internal-call') === 'true'
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!isInternal && (authError || !user)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { prompt, search_query, post_id, business_id, industry } = await req.json() as {
      prompt?: string; search_query?: string; post_id?: string; business_id?: string; industry?: string
    }
    if (!prompt && !search_query) return NextResponse.json({ error: 'prompt or search_query required' }, { status: 400 })

    const query = search_query || prompt?.split(' ').slice(0, 5).join(' ') || 'cafe coffee'
    let imageUrl: string | null = null
    let credit: string | null = null
    let provider = 'none'

    // 1. Pexels — free, beautiful, professional photography (primary source)
    if (!imageUrl) {
      const result = await tryPexels(query, industry)
      if (result) { imageUrl = result.url; credit = result.credit; provider = 'pexels' }
    }

    // 2. Stability AI — AI-generated (if key set)
    if (!imageUrl && prompt) {
      const url = await tryStabilityAI(prompt)
      if (url) { imageUrl = url; credit = null; provider = 'stability_ai' }
    }

    // 3. Unsplash API with curated collections
    if (!imageUrl) {
      const result = await tryUnsplashAPI(query, industry)
      if (result) { imageUrl = result.url; credit = result.credit; provider = 'unsplash' }
    }

    // 3. Pixabay editors choice — curated high quality only
    if (!imageUrl) {
      const result = await tryPixabay(query, industry)
      if (result) { imageUrl = result.url; credit = result.credit; provider = 'pixabay' }
    }

    // 4. Pixabay without editors_choice restriction
    if (!imageUrl) {
      const result = await tryPixabayFallback(query, industry)
      if (result) { imageUrl = result.url; credit = result.credit; provider = 'pixabay_fallback' }
    }

    // 5. Unsplash free source with collection hint — always works
    if (!imageUrl) {
      const collectionId = getCollectionId(query)
      const q = encodeURIComponent(enhanceQuery(query, industry))
      imageUrl = `https://source.unsplash.com/collection/${collectionId}/800x800/?${q}`
      credit = 'Unsplash'; provider = 'unsplash_collection'
    }

    // Update post with image URL
    if (post_id && imageUrl) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin')
      // SECURITY-CRITICAL-4 (B.1.5) — post_id reached this supabaseAdmin update (no RLS backstop)
      // with business_id destructured above but never checked. Internal server-to-server calls
      // (the existing x-internal-call trust boundary, used by the social-suggest async job) are
      // already-trusted and skip this; a normal authenticated caller must own the post's business.
      let allowed = isInternal
      if (!allowed && business_id) {
        const { data: post } = await supabaseAdmin.from('social_posts').select('business_id').eq('id', post_id).maybeSingle()
        if (post?.business_id === business_id) {
          const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user!.id).maybeSingle()
          allowed = !!biz
        }
      }
      if (allowed) {
        await supabaseAdmin.from('social_posts')
          .update({ image_url: imageUrl, image_credit: credit })
          .eq('id', post_id)
      }
    }

    return NextResponse.json({ image_url: imageUrl, credit, provider })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/generate-image', _POST)
