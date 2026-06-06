import { supabaseAdmin } from '@/lib/supabase-admin'

const KEY = process.env.GEOAPIFY_API_KEY ?? ''

export interface GeocodedAddress { lat: number; lng: number; formatted?: string }

export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  if (!address || address.trim().length < 5) return null
  const cacheKey = `geocode:${address.trim().toLowerCase().slice(0, 200)}`

  if (KEY) {
    try {
      const { data: cached } = await supabaseAdmin.from('aria_signal_cache')
        .select('payload, expires_at').eq('cache_key', cacheKey).maybeSingle()
      if (cached && new Date(String(cached.expires_at)).getTime() > Date.now()) {
        return cached.payload as GeocodedAddress
      }
    } catch { /* cache miss is fine */ }

    try {
      const r = await fetch(
        `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&limit=1&filter=countrycode:au&apiKey=${KEY}`,
        { signal: AbortSignal.timeout(5_000) }
      )
      if (r.ok) {
        const j = await r.json()
        const f = j.features?.[0]
        if (f?.properties?.lat && f?.properties?.lon) {
          const result: GeocodedAddress = {
            lat: Number(f.properties.lat),
            lng: Number(f.properties.lon),
            formatted: f.properties.formatted,
          }
          try {
            await supabaseAdmin.from('aria_signal_cache').upsert({
              cache_key: cacheKey, signal_type: 'geocode', payload: result,
              expires_at: new Date(Date.now() + 365 * 24 * 3600_000).toISOString(),
            }, { onConflict: 'cache_key' })
          } catch (e) { console.error('[non-fatal]', e) }
          return result
        }
      }
    } catch { /* fall through to no-key geocoding */ }
  }

  return geocodeOpenMeteo(address)
}

async function geocodeOpenMeteo(address: string): Promise<GeocodedAddress | null> {
  try {
    const hint = address.split(',').map(s => s.trim()).find(s => s.length > 2) ?? address
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(hint)}&count=1&country=AU&language=en`,
      { signal: AbortSignal.timeout(5_000) }
    )
    if (!r.ok) return null
    const j = await r.json()
    const res = j.results?.[0]
    if (!res?.latitude || !res?.longitude) return null
    return { lat: Number(res.latitude), lng: Number(res.longitude), formatted: `${res.name}, AU` }
  } catch { return null }
}
