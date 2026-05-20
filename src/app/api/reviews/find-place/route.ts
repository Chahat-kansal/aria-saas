export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, query } = await req.json()
  if (!business_id || !query) return NextResponse.json({ error: 'business_id and query required' }, { status: 400 })

  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return NextResponse.json({ error: 'Google Places API not configured. Add GOOGLE_PLACES_API_KEY in environment variables.' }, { status: 500 })

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id, name, city, address').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Build search query: business name + city/address for better matching
  const searchQuery = String(query).trim()

  // Use Google Places Text Search to find the business
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${key}`
  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ error: 'Google Places lookup failed' }, { status: 500 })

  const data = await res.json() as { status?: string; results?: Array<{ place_id?: string; name?: string; formatted_address?: string; rating?: number; user_ratings_total?: number; business_status?: string }>; error_message?: string }

  if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
    return NextResponse.json({ matches: [], message: 'No matches found. Try including the city or full address.' })
  }

  if (data.status !== 'OK') {
    return NextResponse.json({ error: data.error_message ?? 'Google search failed' }, { status: 500 })
  }

  // Return top 5 matches with details for user to choose
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
