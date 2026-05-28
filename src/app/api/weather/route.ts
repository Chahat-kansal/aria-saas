export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Server-side proxy for open-meteo so the browser never calls an external host
// directly (which CSP connect-src would block). Clients call /api/weather instead.
// mode=forecast → next 2 days (weather code + rain chance)
// mode=history  → last 30 days precipitation
async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat') ?? '-37.8136')   // default Melbourne
  const lng = Number(searchParams.get('lng') ?? '144.9631')
  const mode = searchParams.get('mode') === 'history' ? 'history' : 'forecast'

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'invalid coordinates' }, { status: 400 })
  }

  const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&timezone=Australia%2FMelbourne`
  const url = mode === 'history'
    ? `${base}&daily=precipitation_sum&past_days=30&forecast_days=0`
    : `${base}&daily=weathercode,precipitation_probability_max&forecast_days=2`

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return NextResponse.json({ daily: null }, { status: 200 })
    const data = await r.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ daily: null }, { status: 200 })
  }
}

export const GET = withErrorCapture('weather', _GET)
