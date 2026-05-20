export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, query } = await req.json()
  if (!business_id || !query) return NextResponse.json({ error: 'business_id and query required' }, { status: 400 })

  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    console.error('[find-place] GOOGLE_PLACES_API_KEY missing in env')
    return NextResponse.json({ error: 'Google Places API key not configured in environment variables. Add GOOGLE_PLACES_API_KEY in Vercel settings.' }, { status: 500 })
  }

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id, name, city, address').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const searchQuery = String(query).trim()

  // Use Google Places Text Search (legacy v1 API)
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&region=au&key=${key}`

  console.log('[find-place] searching:', searchQuery, 'url:', url.replace(key, 'KEY'))

  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    console.error('[find-place] fetch error:', String(e))
    return NextResponse.json({ error: 'Could not reach Google Places API: ' + String(e) }, { status: 500 })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[find-place] HTTP error:', res.status, body)
    return NextResponse.json({ error: `Google API returned ${res.status}: ${body.slice(0, 200)}` }, { status: 500 })
  }

  const data = await res.json() as {
    status?: string
    results?: Array<{ place_id?: string; name?: string; formatted_address?: string; rating?: number; user_ratings_total?: number; business_status?: string }>
    error_message?: string
  }

  console.log('[find-place] response status:', data.status, 'results:', data.results?.length ?? 0)

  // Most useful errors
  if (data.status === 'REQUEST_DENIED') {
    console.error('[find-place] REQUEST_DENIED:', data.error_message)
    return NextResponse.json({
      error: `Google rejected the request: ${data.error_message ?? 'API key may not have Places API enabled. Enable "Places API" in Google Cloud Console for this key.'}`
    }, { status: 500 })
  }

  if (data.status === 'OVER_QUERY_LIMIT') {
    return NextResponse.json({ error: 'Google Places API quota exceeded. Check billing in Google Cloud Console.' }, { status: 500 })
  }

  if (data.status === 'INVALID_REQUEST') {
    return NextResponse.json({ error: `Invalid request: ${data.error_message ?? 'Try a different search term'}` }, { status: 500 })
  }

  if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
    return NextResponse.json({
      matches: [],
      message: 'No matches found. Try including the suburb or street name.',
      debug: { status: data.status, query: searchQuery },
    })
  }

  if (data.status !== 'OK') {
    return NextResponse.json({ error: data.error_message ?? `Google returned status: ${data.status}` }, { status: 500 })
  }

  const matches = data.results.slice(0, 5).map(r => ({
    place_id: r.place_id,
    name: r.name,
    address: r.formatted_address,
    rating: r.rating ?? null,
    total_reviews: r.user_ratings_total ?? 0,
    status: r.business_status ?? 'OPERATIONAL',
  }))

  return NextResponse.json({ matches })
}
