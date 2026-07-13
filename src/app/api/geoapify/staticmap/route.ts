export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { limit } from '@/lib/rate-limit'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Part CX-MAP-1 — LOCKED RULE (same as geoapify/autocomplete): key must never
// reach the client, so this route proxies: client -> here -> Geoapify Static
// Maps. Hit from the public customer-facing [slug]/locations page, which has
// no Supabase session, so rate-limit by IP rather than user id.
const KEY = process.env.GEOAPIFY_API_KEY ?? ''
const MARKER_COLOR = '%23d9f54e' // CX lime accent (Pipel)
const WIDTH = 832  // 2x for a ~416px-wide card (retina)
const HEIGHT = 280 // renders at ~140px display height
const ZOOM = 16

function getIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
}

async function _GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid lat/lng' }, { status: 400 })
  }

  const { ok, retryAfter } = await limit('geoapify-staticmap:' + getIp(req), { requests: 60, window: '1 m' })
  if (!ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  if (!KEY) return NextResponse.json({ error: 'Map unavailable' }, { status: 503 })

  const center = 'lonlat:' + lng + ',' + lat
  const marker = 'lonlat:' + lng + ',' + lat + ';color:' + MARKER_COLOR + ';size:large'
  const url = `https://maps.geoapify.com/v1/staticmap?style=positron&width=${WIDTH}&height=${HEIGHT}&center=${center}&zoom=${ZOOM}&marker=${marker}&apiKey=${KEY}`

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6_000) })
    if (!r.ok) return NextResponse.json({ error: 'Map unavailable' }, { status: 502 })
    const buf = await r.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': r.headers.get('content-type') ?? 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Map unavailable' }, { status: 502 })
  }
}

export const GET = withErrorCapture('geoapify/staticmap', _GET)
