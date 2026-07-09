export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { limit } from '@/lib/rate-limit'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Part B.2 (ADDRESS-1) — LOCKED RULE: Geoapify only (not Google Places, not
// OSM/Nominatim type-ahead). The API key must never reach the client, so this
// route proxies: client -> here -> Geoapify. Rate-limited via the existing
// Upstash sliding-window limiter (30/session/min) so the free 3k/day quota
// can't be burned by abuse.
const KEY = process.env.GEOAPIFY_API_KEY ?? ''

interface GeoapifyFeature {
  properties: {
    formatted?: string
    address_line1?: string
    housenumber?: string
    street?: string
    city?: string
    suburb?: string
    district?: string
    state_code?: string
    state?: string
    postcode?: string
    country_code?: string
    lat?: number
    lon?: number
    place_id?: string
  }
}

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const text = (searchParams.get('text') ?? '').trim()
  if (text.length < 3) return NextResponse.json({ suggestions: [] })

  const { ok, retryAfter } = await limit('geoapify-autocomplete:' + user.id, { requests: 30, window: '1 m' })
  if (!ok) {
    return NextResponse.json(
      { error: 'Too many requests', suggestions: [] },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  // No key configured / quota exhausted — client falls back to manual entry.
  if (!KEY) return NextResponse.json({ suggestions: [], unavailable: true })

  try {
    const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:au&bias=countrycode:au&limit=5&apiKey=${KEY}`
    const r = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!r.ok) return NextResponse.json({ suggestions: [], unavailable: true })
    const j = await r.json() as { features?: GeoapifyFeature[] }
    const suggestions = (j.features ?? []).map(f => {
      const p = f.properties
      return {
        formatted: p.formatted ?? '',
        address_line1: p.address_line1 ?? [p.housenumber, p.street].filter(Boolean).join(' '),
        suburb: p.city ?? p.suburb ?? p.district ?? '',
        state: p.state_code ?? p.state ?? '',
        postcode: p.postcode ?? '',
        country: p.country_code ? p.country_code.toUpperCase() : 'AU',
        lat: typeof p.lat === 'number' ? p.lat : null,
        lng: typeof p.lon === 'number' ? p.lon : null,
        place_id: p.place_id ?? null,
      }
    })
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [], unavailable: true })
  }
}

export const GET = withErrorCapture('geoapify/autocomplete', _GET)
