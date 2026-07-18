export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { markBriefingStale } from '@/lib/aria/briefing-invalidate'
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// Carrier auto-detection from tracking number format
const CARRIER_PATTERNS: Array<{ pattern: RegExp; carrier: string; name: string }> = [
  // ── Specific carrier formats first — most distinctive wins ──
  // Australia Post international, e.g. CC123456789AU
  { pattern: /^[A-Z]{2}\d{9}AU$/i,           carrier: 'auspost',        name: 'Australia Post' },
  // Modern AusPost 23-char article id, e.g. 34PDN740013301000935104
  { pattern: /^\d{2}[A-Z]{2,4}\d{14,18}$/i,   carrier: 'auspost',        name: 'Australia Post' },
  // AusPost domestic id with a single embedded letter, e.g. 364Y75014137
  { pattern: /^\d{2,5}[A-Z]\d{6,12}$/i,        carrier: 'auspost',        name: 'Australia Post' },
  { pattern: /^33\d{10}$/,                    carrier: 'aramex',         name: 'Aramex' },
  { pattern: /^3933\d{8}$/,                   carrier: 'aramex',         name: 'Aramex' },
  { pattern: /^[A-Z]{2}\d{8}/i,               carrier: 'tnt',            name: 'TNT' },
  { pattern: /^[0-9]{20,22}$/,                carrier: 'fedex',          name: 'FedEx' },
  { pattern: /^[0-9]{18}$/,                   carrier: 'couriersplease', name: 'Couriers Please' },
  // All-numeric domestic article ids (AusPost is the common case in AU)
  { pattern: /^\d{11,13}$/,                   carrier: 'auspost',        name: 'Australia Post' },
  { pattern: /^[0-9]{12}$/,                   carrier: 'dhl',            name: 'DHL Express' },
  { pattern: /^\d{10}$/,                      carrier: 'startrack',      name: 'StarTrack' },
  // ── LAST: generic alphanumeric catch-all (10-24 chars, >=1 letter). ──
  // Only reached if nothing specific matched; 17TRACK confirms the real carrier.
  { pattern: /^(?=.*[A-Z])[A-Z0-9]{10,24}$/i, carrier: 'auspost',        name: 'Australia Post' },
]

function detectCarrier(tn: string): { carrier: string; name: string } {
  for (const cp of CARRIER_PATTERNS) {
    if (cp.pattern.test(tn)) return { carrier: cp.carrier, name: cp.name }
  }
  return { carrier: 'other', name: 'Unknown Carrier' }
}

// Human labels for every carrier the dropdown can send (including ones with
// no distinctive number format, so a manual pick always gets a proper name).
const CARRIER_LABELS: Record<string, string> = {
  auspost: 'Australia Post', startrack: 'StarTrack', aramex: 'Aramex',
  couriersplease: 'Couriers Please', tnt: 'TNT', dhl: 'DHL Express',
  fedex: 'FedEx', ups: 'UPS', toll: 'Toll', sendle: 'Sendle',
  dhlecommerce: 'DHL eCommerce', other: 'Unknown Carrier',
}

// 17TRACK API — 3,300+ carriers, 100 free/month, continuous updates FREE after registration
// Sign up: https://features.17track.net/en/api — add TRACK17_API_KEY to Vercel env vars
// Webhook: 17TRACK dashboard → Webhooks → https://www.ariaos.site/api/pos/parcel-tracking/webhook

const TRACK17_CARRIER_MAP: Record<string, number> = {
  // 17TRACK numeric carrier codes (see res.17track.net/asset/carrier/info/apicarrier.all.json)
  auspost: 1151, startrack: 100176, aramex: 100129,
  couriersplease: 100264, tnt: 100100, dhl: 7041, fedex: 100003,
  ups: 100002, toll: 101033, sendle: 101105,
}

export interface Track17Result {
  status: string; statusDetail: string
  events: Array<{ time: string; location: string; description: string }>
  estimatedDelivery: string | null; deliveredAt: string | null
}

/**
 * Looks up live tracking via 17TRACK.
 * Returns { result } on success, or { error } describing exactly what went
 * wrong so the UI can surface it instead of silently saving a blank parcel.
 */
export interface Track17Result {
  status: string; statusDetail: string
  events: Array<{ time: string; location: string; description: string }>
  estimatedDelivery: string | null; deliveredAt: string | null
}

// Maps 17TRACK v2.2 main status strings to our internal status values.
const STATUS_MAP: Record<string, string> = {
  NotFound: 'pending', InfoReceived: 'pending', InTransit: 'in_transit',
  Expired: 'exception', AvailableForPickup: 'awaiting_collection',
  OutForDelivery: 'out_for_delivery', DeliveryFailure: 'exception',
  Delivered: 'delivered', Exception: 'exception',
}

/**
 * Looks up live tracking via the 17TRACK v2.2 API.
 * v2.2 is NOT backward compatible with v1 — the response shape is
 * track_info.latest_status / latest_event / tracking.providers[].events[].
 * Returns { result } on success or { error } describing the failure.
 */
export async function lookup17Track(
  trackingNumber: string,
  carrierCode?: string,
): Promise<{ result: Track17Result | null; error: string | null }> {
  const apiKey = process.env.TRACK17_API_KEY
  if (!apiKey || apiKey === 'false') {
    console.log('[parcel-tracking] TRACK17_API_KEY not set — add to Vercel env vars')
    return { result: null, error: 'tracking_api_not_configured' }
  }

  const carrierNum = carrierCode ? (TRACK17_CARRIER_MAP[carrierCode] ?? 0) : 0
  const V2 = 'https://api.17track.net/track/v2.2'
  const headers = { 'Content-Type': 'application/json', '17token': apiKey }

  try {
    // Step 1: Register the number. Quota is only consumed here; -18019901
    // ("already registered") is a success for our purposes.
    const regBody = JSON.stringify([
      { number: trackingNumber, carrier: carrierNum || undefined, auto_detection: true },
    ])
    const registerRes = await fetch(V2 + '/register', {
      method: 'POST', headers, body: regBody, signal: AbortSignal.timeout(12_000),
    })
    if (registerRes.status === 401) {
      console.error('[parcel-tracking] 17TRACK register 401 — key/IP/account issue')
      return { result: null, error: 'tracking_api_key_invalid' }
    }
    if (registerRes.ok) {
      const regData = await registerRes.json().catch(() => null) as
        { code?: number; data?: { rejected?: Array<{ error?: { code?: number; message?: string } }> } } | null
      const regRej = regData?.data?.rejected?.[0]
      if (regRej?.error && regRej.error.code !== -18019901) {
        const c = regRej.error.code
        console.error('[parcel-tracking] 17TRACK register rejected:', c, regRej.error.message)
        if (c === -18019903) return { result: null, error: 'tracking_number_unrecognised' }
        if (c === -18019908 || c === -18019907) return { result: null, error: 'tracking_quota_exceeded' }
        if (c === -18010012 || c === -18010013) return { result: null, error: 'tracking_number_unrecognised' }
        return { result: null, error: 'tracking_api_unavailable' }
      }
    } else {
      console.error('[parcel-tracking] 17TRACK register HTTP error:', registerRes.status)
    }

    // Step 2: Get tracking details (no quota cost).
    const trackRes = await fetch(V2 + '/gettrackinfo', {
      method: 'POST', headers,
      body: JSON.stringify([{ number: trackingNumber, carrier: carrierNum || undefined }]),
      signal: AbortSignal.timeout(12_000),
    })
    if (!trackRes.ok) {
      console.error('[parcel-tracking] 17TRACK gettrackinfo HTTP error:', trackRes.status)
      if (trackRes.status === 401) return { result: null, error: 'tracking_api_key_invalid' }
      if (trackRes.status === 429) return { result: null, error: 'tracking_api_unavailable' }
      return { result: null, error: 'tracking_api_unavailable' }
    }

    // v2.2 response shape
    interface V22Event {
      time_utc?: string | null; time_iso?: string | null
      description?: string | null; location?: string | null
      stage?: string | null
    }
    interface V22Accepted {
      number: string
      track_info?: {
        latest_status?: { status?: string; sub_status?: string }
        latest_event?: V22Event
        time_metrics?: { estimated_delivery_date?: { from?: string | null; to?: string | null } }
        milestone?: Array<{ key_stage?: string; time_utc?: string | null }>
        tracking?: { providers?: Array<{ events?: V22Event[] }> }
      }
    }
    const data = await trackRes.json() as {
      code: number
      data?: {
        accepted?: V22Accepted[]
        rejected?: Array<{ number: string; error?: { code?: number; message?: string } }>
        errors?: Array<{ code?: number; message?: string }>
      }
    }

    if (data.code !== 0) {
      console.error('[parcel-tracking] 17TRACK gettrackinfo code:', data.code)
      return { result: null, error: 'tracking_api_unavailable' }
    }
    if (data.data?.errors?.length) {
      console.error('[parcel-tracking] 17TRACK gettrackinfo errors:', JSON.stringify(data.data.errors))
      return { result: null, error: 'tracking_api_unavailable' }
    }

    const rejected = data.data?.rejected?.[0]
    if (rejected) {
      console.error('[parcel-tracking] 17TRACK rejected:', rejected.error?.code, rejected.error?.message)
      return { result: null, error: 'tracking_number_unrecognised' }
    }

    const item = data.data?.accepted?.[0]
    const ti = item?.track_info
    if (!item || !ti) {
      // Registered but no data crawled yet — normal for a fresh number.
      console.log('[parcel-tracking] 17TRACK registered, no data yet:', trackingNumber)
      return { result: { status: 'pending', statusDetail: 'Registered — awaiting carrier scan', events: [], estimatedDelivery: null, deliveredAt: null }, error: null }
    }

    const statusStr = ti.latest_status?.status ?? 'NotFound'
    const status = STATUS_MAP[statusStr] ?? 'pending'

    // Flatten every provider's events; sort newest-first.
    const rawEvents: V22Event[] = []
    for (const p of ti.tracking?.providers ?? []) {
      for (const ev of p.events ?? []) rawEvents.push(ev)
    }
    const events = rawEvents
      .map(ev => ({
        time: ev.time_utc ?? ev.time_iso ?? '',
        location: ev.location ?? '',
        description: ev.description ?? '',
      }))
      .filter(e => e.time || e.description)
      .sort((a, b) => (b.time || '').localeCompare(a.time || ''))

    const latest = ti.latest_event
    const statusDetail = latest?.description ?? events[0]?.description ?? statusStr

    let deliveredAt: string | null = null
    if (status === 'delivered') {
      const dm = (ti.milestone ?? []).find(m => m.key_stage === 'Delivered')
      deliveredAt = dm?.time_utc ?? latest?.time_utc ?? events[0]?.time ?? null
    }
    const edd = ti.time_metrics?.estimated_delivery_date
    const estimatedDelivery = edd?.to ?? edd?.from ?? null

    console.log('[parcel-tracking] 17TRACK v2.2 result:', trackingNumber, '->', status, '| events:', events.length)

    return {
      result: { status, statusDetail, events, estimatedDelivery, deliveredAt },
      error: null,
    }
  } catch (e) {
    console.error('[parcel-tracking] 17TRACK exception:', String(e).slice(0, 200))
    return { result: null, error: 'tracking_api_unavailable' }
  }
}

// GET — list parcels with search + filter
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ parcels: [] })

  const { searchParams } = new URL(req.url)
  const direction = searchParams.get('direction')
  const status = searchParams.get('status')
  const search = searchParams.get('search')?.trim()

  let q = supabaseAdmin.from('pos_parcel_tracking')
    .select('*').eq('business_id', bid)
    .order('created_at', { ascending: false }).limit(200)

  if (direction) q = q.eq('direction', direction)
  if (status === 'active') q = q.not('status', 'in', '("delivered","exception")')
  else if (status === 'delivered') q = q.eq('status', 'delivered')
  if (search) q = q.or(`tracking_number.ilike.%${search}%,recipient_name.ilike.%${search}%,order_reference.ilike.%${search}%,label.ilike.%${search}%`)

  const { data } = await q
  return NextResponse.json({ parcels: data ?? [] })
}

// POST — add a parcel (full delivery record)
async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as {
    tracking_number: string; carrier?: string; label?: string
    direction?: string; notes?: string; reference_type?: string; reference_id?: string
    recipient_name?: string; recipient_phone?: string; recipient_address?: string
    recipient_city?: string; recipient_state?: string; recipient_postcode?: string
    order_reference?: string
  }

  if (!body.tracking_number?.trim()) return NextResponse.json({ error: 'tracking_number required' }, { status: 400 })

  const tn = body.tracking_number.trim().toUpperCase()
  // 'other' is the dropdown's "Auto-detect" value — treat it as unspecified so
  // auto-detection still runs. Only an explicit non-'other' carrier overrides it.
  const detected = detectCarrier(tn)
  const explicitCarrier = body.carrier && body.carrier !== 'other' ? body.carrier : null
  const carrierCode = explicitCarrier ?? detected.carrier
  const carrierName = explicitCarrier
    ? (CARRIER_LABELS[explicitCarrier] ?? 'Unknown Carrier')
    : detected.name

  const { result: liveData, error: lookupError } = await lookup17Track(tn, carrierCode)

  const { data, error } = await supabaseAdmin.from('pos_parcel_tracking').insert({
    business_id: bid, tracking_number: tn,
    carrier: carrierCode, carrier_name: carrierName,
    label: body.label ?? null, direction: body.direction ?? 'inbound',
    status: liveData?.status ?? 'pending',
    status_detail: liveData?.statusDetail ?? null,
    events: liveData?.events ?? [],
    estimated_delivery: liveData?.estimatedDelivery ?? null,
    delivered_at: liveData?.deliveredAt ?? null,
    last_checked_at: new Date().toISOString(),
    last_event_at: liveData?.events?.[0]?.time ? new Date(liveData.events[0].time).toISOString() : null,
    notes: body.notes ?? null,
    reference_type: body.reference_type ?? null,
    reference_id: body.reference_id ?? null,
    recipient_name: body.recipient_name ?? null,
    recipient_phone: body.recipient_phone ?? null,
    recipient_address: body.recipient_address ?? null,
    recipient_city: body.recipient_city ?? null,
    recipient_state: body.recipient_state ?? null,
    recipient_postcode: body.recipient_postcode ?? null,
    order_reference: body.order_reference ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log to activity + trigger autopilot if exception
  if (liveData?.status === 'exception') {
    void upsertAriaAction({
      business_id: bid, category: 'delivery', priority: 'high',
      title: `Delivery exception: ${tn}`, status: 'pending', source: 'parcel_tracking',
      recommendation: `Parcel ${tn} (${carrierName}) has an exception. Contact carrier or recipient.`,
      payload: { tracking_number: tn, carrier: carrierName },
    })
  }

  // Surface a human-readable warning when live detection could not run, so the
  // operator knows the parcel was saved but tracking is not live yet.
  const warningMap: Record<string, string> = {
    tracking_api_not_configured: 'Parcel saved. Live tracking is not set up yet — add a 17TRACK API key in settings to auto-detect status.',
    tracking_api_key_invalid:    'Parcel saved, but the tracking API key was rejected. Check the 17TRACK key in your environment settings.',
    tracking_quota_exceeded:     'Parcel saved, but this month\'s free tracking lookups are used up. Status will refresh next cycle.',
    tracking_number_unrecognised:'Parcel saved, but the carrier could not be auto-detected from this number. Pick the carrier manually, then Refresh.',
    tracking_api_unavailable:    'Parcel saved, but the tracking service did not respond. Tap Refresh in a moment to retry.',
  }
  const warning = lookupError ? (warningMap[lookupError] ?? null) : null

  return NextResponse.json({ parcel: data, warning, tracking_live: !!liveData })
}

// PATCH — refresh tracking, manual status override, or update fields
async function _PATCH(req: Request, _context: unknown, { userId, businessId: bid }: BusinessContext) {
  const body = await req.json() as {
    id: string; refresh?: boolean
    label?: string; notes?: string; order_reference?: string
    manual_status?: string  // manual override: delivered, on_hold, awaiting_collection, cancelled, failed
    recipient_name?: string; recipient_phone?: string; recipient_address?: string
    recipient_city?: string; recipient_state?: string; recipient_postcode?: string
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('pos_parcel_tracking')
    .select('*').eq('id', body.id).eq('business_id', bid).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) updates.label = body.label
  if (body.notes !== undefined) updates.notes = body.notes
  if (body.order_reference !== undefined) updates.order_reference = body.order_reference
  if (body.manual_status !== undefined) {
    updates.manual_status = body.manual_status
    updates.status = body.manual_status  // also update computed status
    if (body.manual_status === 'delivered') updates.delivered_at = new Date().toISOString()
  }
  if (body.recipient_name !== undefined) updates.recipient_name = body.recipient_name
  if (body.recipient_phone !== undefined) updates.recipient_phone = body.recipient_phone
  if (body.recipient_address !== undefined) updates.recipient_address = body.recipient_address
  if (body.recipient_city !== undefined) updates.recipient_city = body.recipient_city
  if (body.recipient_state !== undefined) updates.recipient_state = body.recipient_state
  if (body.recipient_postcode !== undefined) updates.recipient_postcode = body.recipient_postcode

  let refreshWarning: string | null = null
  if (body.refresh) {
    const { result: liveData, error: lookupError } = await lookup17Track(existing.tracking_number, existing.carrier)
    if (lookupError) {
      const wm: Record<string, string> = {
        tracking_api_not_configured: 'Live tracking is not set up — add a 17TRACK API key in settings.',
        tracking_api_key_invalid:    'The tracking API key was rejected. Check your 17TRACK key.',
        tracking_quota_exceeded:     'This month\'s free tracking lookups are used up.',
        tracking_number_unrecognised:'Carrier could not be detected — pick the carrier manually and refresh again.',
        tracking_api_unavailable:    'Tracking service did not respond. Try again shortly.',
      }
      refreshWarning = wm[lookupError] ?? null
    }
    if (liveData) {
      updates.status = body.manual_status ?? liveData.status
      updates.status_detail = liveData.statusDetail
      updates.events = liveData.events
      updates.estimated_delivery = liveData.estimatedDelivery
      updates.delivered_at = liveData.deliveredAt
      updates.last_checked_at = new Date().toISOString()
      if (liveData.events?.[0]?.time) updates.last_event_at = new Date(liveData.events[0].time).toISOString()

      // Autopilot action on exception
      if (liveData.status === 'exception' && existing.status !== 'exception') {
        void upsertAriaAction({
          business_id: bid, category: 'delivery', priority: 'high',
          title: `Delivery exception: ${existing.tracking_number}`, status: 'pending', source: 'parcel_tracking',
          recommendation: `Parcel ${existing.tracking_number} has an exception. Check with ${existing.carrier_name}.`,
          payload: { tracking_number: existing.tracking_number, carrier: existing.carrier_name },
        })
      }

      // Log to activity when delivered
      if (liveData.status === 'delivered' && existing.status !== 'delivered') {
        void supabaseAdmin.from('audit_logs').insert({
          business_id: bid, entity: 'parcel_tracking', entity_id: body.id,
          action: 'delivered', user_id: userId,
          details: { tracking_number: existing.tracking_number, carrier: existing.carrier_name },
        })
      }
    } else {
      updates.last_checked_at = new Date().toISOString()
    }
  }

  const { data, error } = await supabaseAdmin.from('pos_parcel_tracking')
    .update(updates).eq('id', body.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  void markBriefingStale(bid)
  return NextResponse.json({ parcel: data, warning: refreshWarning })
}

async function _DELETE(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const { id } = await req.json() as { id: string }
  await supabaseAdmin.from('pos_parcel_tracking').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/parcel-tracking', _GET)
export const POST = withBusinessContext('pos/parcel-tracking', _POST)
export const PATCH = withBusinessContext('pos/parcel-tracking', _PATCH)
export const DELETE = withBusinessContext('pos/parcel-tracking', _DELETE)
