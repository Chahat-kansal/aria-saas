export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getBusinessAddress } from '@/lib/business-address'
import { LocationsClient } from './LocationsClient'

type Outlet = {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  is_default: boolean | null
  is_active: boolean | null
  opening_hours: unknown
  lat: number | null
  lng: number | null
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Converts business_hours rows (day_of_week 0=Sun..6=Sat) into the same
// {day: {open,close,closed}} shape pos_outlets.opening_hours already uses,
// so the single-location fallback below renders through the same UI.
function hoursToOpeningHoursJson(rows: { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean | null }[]) {
  const out: Record<string, { open: string; close: string; closed?: boolean }> = {}
  for (const r of rows) {
    const key = DAY_KEYS[r.day_of_week]
    if (!key) continue
    out[key] = { open: (r.open_time ?? '').slice(0, 5), close: (r.close_time ?? '').slice(0, 5), closed: !!r.is_closed }
  }
  return out
}

export default async function LocationsPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, logo_url')
    .eq('id', bid)
    .maybeSingle()
  if (!biz) notFound()

  const { data: outletRows } = await supabaseAdmin
    .from('pos_outlets')
    .select('id, name, address, phone, is_default, is_active, opening_hours, lat, lng')
    .eq('business_id', bid)
    .eq('is_active', true)
    .order('is_default', { ascending: false })

  let outlets: Outlet[] = (outletRows ?? []) as Outlet[]

  // Part B.5 — single-outlet/no-outlet businesses fall back to the business's
  // own address (via the one resolver) rather than showing "No locations found."
  if (outlets.length === 0) {
    const addr = await getBusinessAddress(bid)
    if (addr && addr.formatted) {
      const { data: hourRows } = await supabaseAdmin
        .from('business_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('business_id', bid)
      outlets = [{
        id: bid,
        name: (biz.name as string) ?? 'Location',
        address: addr.formatted,
        phone: null,
        is_default: true,
        is_active: true,
        opening_hours: hourRows && hourRows.length > 0 ? hoursToOpeningHoursJson(hourRows) : null,
        lat: addr.lat,
        lng: addr.lng,
      }]
    }
  }

  return (
    <LocationsClient
      slug={slug}
      bizId={bid}
      bizName={(biz.name as string) ?? ''}
      outlets={outlets}
    />
  )
}
