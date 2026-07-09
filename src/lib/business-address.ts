import { supabaseAdmin } from '@/lib/supabase-admin'

// Part B.3 (ADDRESS-1) — the ONE resolver every consumer must call for a
// business's address. No bespoke `.select('address, city, ...')` reads
// elsewhere — this is the single source of truth for both the structured
// fields and a ready-to-render formatted string.
export interface BusinessAddress {
  address_line1: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  country: string
  lat: number | null
  lng: number | null
  place_id: string | null
  formatted_address: string | null
  /** Best-effort single-line address for display, always non-null (empty string if nothing on file). */
  formatted: string
  /** Google Maps deep link built from lat/lng — no embed API key required. */
  mapsUrl: string | null
}

function buildFormatted(parts: {
  address_line1: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  country: string | null
}): string {
  const line2 = [parts.suburb, parts.state, parts.postcode].filter(Boolean).join(' ')
  const full = [parts.address_line1, line2].filter(Boolean).join(', ')
  if (full) return full
  return ''
}

export async function getBusinessAddress(businessId: string): Promise<BusinessAddress | null> {
  const { data, error } = await supabaseAdmin
    .from('businesses')
    .select('address, suburb, city, business_state, postcode, country, lat, lng, place_id, formatted_address')
    .eq('id', businessId)
    .maybeSingle()

  if (error || !data) return null

  const address_line1 = data.address ?? null
  // `suburb` is the newer, canonical field (Part B); `city` predates it and is
  // still written by onboarding/settings — fall back rather than double-write.
  const suburb = data.suburb ?? data.city ?? null
  const state = data.business_state ?? null
  const postcode = data.postcode ?? null
  const country = data.country ?? 'AU'
  const lat = typeof data.lat === 'number' ? data.lat : null
  const lng = typeof data.lng === 'number' ? data.lng : null

  const formatted = data.formatted_address || buildFormatted({ address_line1, suburb, state, postcode, country })

  return {
    address_line1,
    suburb,
    state,
    postcode,
    country,
    lat,
    lng,
    place_id: data.place_id ?? null,
    formatted_address: data.formatted_address ?? null,
    formatted,
    mapsUrl: lat !== null && lng !== null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null,
  }
}

// Per-outlet variant — falls back to the parent business's address when the
// outlet has none of its own set (Part B.5 — single-outlet businesses never
// need to fill this in separately).
export async function getOutletAddress(outletId: string): Promise<BusinessAddress | null> {
  const { data: outlet, error } = await supabaseAdmin
    .from('pos_outlets')
    .select('business_id, address, suburb, state, postcode, country, lat, lng, place_id, formatted_address')
    .eq('id', outletId)
    .maybeSingle()

  if (error || !outlet) return null

  const hasOwnAddress = !!(outlet.address || outlet.lat)
  if (!hasOwnAddress) {
    return outlet.business_id ? getBusinessAddress(outlet.business_id) : null
  }

  const address_line1 = outlet.address ?? null
  const suburb = outlet.suburb ?? null
  const state = outlet.state ?? null
  const postcode = outlet.postcode ?? null
  const country = outlet.country ?? 'AU'
  const lat = typeof outlet.lat === 'number' ? outlet.lat : null
  const lng = typeof outlet.lng === 'number' ? outlet.lng : null
  const formatted = outlet.formatted_address || buildFormatted({ address_line1, suburb, state, postcode, country })

  return {
    address_line1,
    suburb,
    state,
    postcode,
    country,
    lat,
    lng,
    place_id: outlet.place_id ?? null,
    formatted_address: outlet.formatted_address ?? null,
    formatted,
    mapsUrl: lat !== null && lng !== null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null,
  }
}
