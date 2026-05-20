export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const INDUSTRY_CONTEXT: Record<string, string> = {
  cafe: 'coffee latte cafe barista',
  restaurant: 'food restaurant plating',
  retail: 'product store retail',
  bakery: 'bakery pastry bread',
  bar: 'cocktail drinks bar',
  liquor: 'wine spirits bottle',
}

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query') ?? ''
  const industry = searchParams.get('industry') ?? 'cafe'
  const context = INDUSTRY_CONTEXT[industry] ?? ''
  const enrichedQuery = [query.slice(0, 60), context].filter(Boolean).join(' ').trim()

  const photos: Array<{ id: string; url: string; thumb: string; photographer: string; source: string }> = []

  // Try Pexels first (best quality, free)
  const pexelsKey = process.env.PEXELS_API_KEY
  if (pexelsKey) {
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(enrichedQuery)}&per_page=9&orientation=square`,
        { headers: { Authorization: pexelsKey } }
      )
      if (res.ok) {
        const d = await res.json() as { photos?: Array<{ id: number; src?: { medium?: string; large?: string; small?: string }; photographer?: string }> }
        for (const p of d.photos ?? []) {
          if (p.src?.medium) {
            photos.push({ id: String(p.id), url: p.src.large ?? p.src.medium, thumb: p.src.small ?? p.src.medium, photographer: p.photographer ?? 'Pexels', source: 'pexels' })
          }
        }
      }
    } catch { /* fall through */ }
  }

  // Unsplash fallback
  if (photos.length < 4) {
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY
    if (unsplashKey) {
      try {
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(enrichedQuery)}&per_page=9&orientation=square&content_filter=high`,
          { headers: { Authorization: `Client-ID ${unsplashKey}` } }
        )
        if (res.ok) {
          const d = await res.json() as { results?: Array<{ id: string; urls?: { regular?: string; thumb?: string; small?: string }; user?: { name?: string } }> }
          for (const p of d.results ?? []) {
            if (p.urls?.regular && !photos.find(x => x.id === p.id)) {
              photos.push({ id: p.id, url: p.urls.regular, thumb: p.urls.thumb ?? p.urls.small ?? p.urls.regular, photographer: p.user?.name ?? 'Unsplash', source: 'unsplash' })
            }
          }
        }
      } catch { /* fall through */ }
    }
  }

  return NextResponse.json({ photos })
}

export const GET = withErrorCapture('social/image-suggest', _GET)
