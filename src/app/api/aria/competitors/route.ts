export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import * as Sentry from '@sentry/nextjs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const INDUSTRY_SEARCH: Record<string, { type: string; keyword: string }> = {
  retail:      { type: 'store',         keyword: 'retail store shop' },
  cafe:        { type: 'cafe',          keyword: 'cafe coffee shop' },
  restaurant:  { type: 'restaurant',   keyword: 'restaurant' },
  liquor:      { type: 'liquor_store', keyword: 'bottle shop liquor' },
  pharmacy:    { type: 'pharmacy',     keyword: 'pharmacy chemist' },
  bakery:      { type: 'bakery',       keyword: 'bakery' },
  supermarket: { type: 'supermarket', keyword: 'supermarket grocery' },
  default:     { type: 'store',        keyword: 'shop' },
}

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// AU retail chain fallback when no Places key
const AU_CHAINS: Record<string, string[]> = {
  liquor:      ['Dan Murphy\'s', 'BWS', 'Liquorland', 'First Choice Liquor', 'Vintage Cellars'],
  retail:      ['Woolworths', 'Coles', 'IGA', 'Aldi', 'Harris Farm'],
  cafe:        ['Gloria Jean\'s', 'The Coffee Club', 'Muffin Break', 'Michel\'s Patisserie'],
  restaurant:  ['Nando\'s', 'Grill\'d', 'Hungry Jack\'s', 'Red Rooster'],
  pharmacy:    ['Chemist Warehouse', 'Priceline', 'Terry White Chemmart', 'Blooms The Chemist'],
  supermarket: ['Woolworths', 'Coles', 'IGA', 'Aldi'],
  bakery:      ['Bakers Delight', 'Brumby\'s Bakery'],
  default:     ['Woolworths', 'Coles', 'IGA'],
}

async function _GET(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const business_id = searchParams.get('business_id')
    const radius_m = parseInt(searchParams.get('radius_m') || '5000')
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

    const { data: biz } = await supabase.from('businesses')
      .select('id,name,industry,city,address')
      .eq('id', business_id).eq('user_id', user.id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 7-day cache check
    const cacheFloor = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: cached } = await supabase.from('competitor_businesses')
      .select('*').eq('business_id', business_id)
      .gte('last_checked', cacheFloor).order('distance_m')
    if (cached && cached.length > 0) return NextResponse.json({ competitors: cached, from_cache: true })

    const key = process.env.GOOGLE_PLACES_API_KEY
    if (!key) {
      return NextResponse.json({
        competitors: [],
        from_cache: false,
        no_api_key: true,
        message: 'Competitor scanning requires Google Places API key. Contact support to enable.',
      })
    }

    // Geocode business address
    const geocodeQuery = encodeURIComponent(`${biz.address || ''} ${biz.city || ''} Australia`)
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${geocodeQuery}&key=${key}`
    )
    const geoData = await geoRes.json()
    const location = geoData.results?.[0]?.geometry?.location
    if (!location) return NextResponse.json({ competitors: [], error: 'Could not geocode address' })

    const { lat, lng } = location
    const search = INDUSTRY_SEARCH[biz.industry] ?? INDUSTRY_SEARCH.default

    // Nearby search
    const nearbyRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius_m}&type=${search.type}&keyword=${encodeURIComponent(search.keyword)}&key=${key}`
    )
    const nearbyData = await nearbyRes.json()
    const places: any[] = nearbyData.results ?? []

    // Filter own business and out-of-radius places first
    const bizFirstWord = biz.name.toLowerCase().split(' ')[0]
    const filteredPlaces = places.slice(0, 12).filter(place => {
      if (place.name.toLowerCase().includes(bizFirstWord)) return false
      const pLat = place.geometry?.location?.lat ?? lat
      const pLng = place.geometry?.location?.lng ?? lng
      return Math.round(haversineMetres(lat, lng, pLat, pLng)) <= radius_m
    }).slice(0, 10)

    // Fetch all place details in parallel
    const placeDetails = await Promise.all(
      filteredPlaces.map(async (place) => {
        try {
          const detailRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating&key=${key}`
          )
          const detail = await detailRes.json()
          return { website: detail.result?.website ?? null, phone: detail.result?.formatted_phone_number ?? null }
        } catch {
          return { website: null, phone: null }
        }
      })
    )

    const competitors: any[] = filteredPlaces.map((place, i) => ({
      business_id,
      competitor_name: place.name,
      competitor_address: place.vicinity || place.formatted_address || null,
      competitor_place_id: place.place_id,
      distance_m: Math.round(haversineMetres(lat, lng, place.geometry?.location?.lat ?? lat, place.geometry?.location?.lng ?? lng)),
      category: biz.industry,
      phone: placeDetails[i].phone,
      website: placeDetails[i].website,
      google_rating: place.rating ?? null,
      last_checked: new Date().toISOString(),
    }))

    // Sort by distance
    competitors.sort((a, b) => a.distance_m - b.distance_m)

    // Save to cache
    if (competitors.length > 0) {
      await supabase.from('competitor_businesses')
        .delete().eq('business_id', business_id)
      await supabase.from('competitor_businesses').insert(competitors)

      // Also upsert into aria_competitor_watches so the cron picks them up for monitoring.
      // Decision: scan → competitor_businesses AND aria_competitor_watches; page reads both tables.
      const watchRows = competitors.map(c => ({
        business_id,
        competitor_name: c.competitor_name,
        competitor_url: c.website ?? null,
        is_active: true,
      }))
      await supabase.from('aria_competitor_watches')
        .upsert(watchRows, { onConflict: 'business_id,competitor_name', ignoreDuplicates: true })
    }

    return NextResponse.json({ competitors, from_cache: false })
  } catch (err: unknown) {
    Sentry.captureException(err, { tags: { route: 'aria/competitors' } })
    return NextResponse.json({ competitors: [], status: 'error', message: 'temporarily_unavailable' }, { status: 200 })
  }
}

export const GET = withErrorCapture('aria/competitors', _GET)
