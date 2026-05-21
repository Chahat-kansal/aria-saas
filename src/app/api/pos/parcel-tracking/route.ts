export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// Carrier auto-detection from tracking number format
const CARRIER_PATTERNS: Array<{ pattern: RegExp; carrier: string; name: string }> = [
  { pattern: /^[A-Z]{2}\d{9}AU$/i,    carrier: 'auspost',        name: 'Australia Post' },
  { pattern: /^\d{11,13}$/,            carrier: 'auspost',        name: 'Australia Post' },
  { pattern: /^33\d{10}$/,             carrier: 'aramex',         name: 'Aramex' },
  { pattern: /^3933\d{8}$/,            carrier: 'aramex',         name: 'Aramex' },
  { pattern: /^\d{10}$/,               carrier: 'startrack',      name: 'StarTrack' },
  { pattern: /^[0-9]{12}$/,            carrier: 'dhl',            name: 'DHL Express' },
  { pattern: /^[0-9]{20}$/,            carrier: 'fedex',          name: 'FedEx' },
  { pattern: /^[0-9]{18}$/,            carrier: 'couriersplease', name: 'Couriers Please' },
  { pattern: /^[A-Z]{2}\d{8}/i,        carrier: 'tnt',            name: 'TNT' },
]

function detectCarrier(tn: string): { carrier: string; name: string } {
  for (const cp of CARRIER_PATTERNS) {
    if (cp.pattern.test(tn)) return { carrier: cp.carrier, name: cp.name }
  }
  return { carrier: 'other', name: 'Unknown Carrier' }
}

// 17TRACK API — 3,300+ carriers, 100 free/month, continuous updates FREE after registration
// Sign up: https://features.17track.net/en/api — add TRACK17_API_KEY to Vercel env vars
// Webhook: 17TRACK dashboard → Webhooks → https://www.ariaos.site/api/pos/parcel-tracking/webhook

const TRACK17_CARRIER_MAP: Record<string, string> = {
  auspost: '3011', aramex: '190189', startrack: '3011', // StarTrack uses AusPost codes
  dhl: '100003', fedex: '100002', couriersplease: '3024', tnt: '190003',
}

export async function lookup17Track(trackingNumber: string, carrierCode?: string): Promise<{
  status: string; statusDetail: string
  events: Array<{ time: string; location: string; description: string }>
  estimatedDelivery: string | null; deliveredAt: string | null
} | null> {
  const apiKey = process.env.TRACK17_API_KEY
  if (!apiKey || apiKey === 'false') {
    console.log('[parcel-tracking] TRACK17_API_KEY not set — add to Vercel env vars')
    return null
  }

  const carrierNum = carrierCode ? (TRACK17_CARRIER_MAP[carrierCode] ?? 0) : 0

  try {
    // Step 1: Register tracking number (1 quota used here — continuous updates are FREE after this)
    const registerRes = await fetch('https://api.17track.net/track/v2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '17token': apiKey },
      body: JSON.stringify([{ number: trackingNumber, carrier: carrierNum || undefined }]),
      signal: AbortSignal.timeout(12_000),
    })
    if (!registerRes.ok) console.error('[parcel-tracking] 17TRACK register error:', registerRes.status)

    // Step 2: Fetch current tracking info (no quota cost after registration)
    const trackRes = await fetch('https://api.17track.net/track/v2/gettrackinfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '17token': apiKey },
      body: JSON.stringify([{ number: trackingNumber }]),
      signal: AbortSignal.timeout(12_000),
    })

    if (!trackRes.ok) {
      console.error('[parcel-tracking] 17TRACK gettrackinfo error:', trackRes.status)
      return null
    }

    const data = await trackRes.json() as {
      code: number
      data?: {
        accepted?: Array<{
          number: string
          track: {
            e: number  // status: 0=unknown,10=pending,20=transit,25=expired,30=pickup,35=undelivered,40=delivered,50=exception
            w1?: string // carrier name
            b?: string  // estimated delivery date
            z0?: { a: string; d: string } // latest event {time, description}
            z1?: Array<{ a: string; b?: string; c?: string; d: string }> // events {time, location, detail, description}
          }
        }>
        rejected?: Array<{ number: string; error: { code: number; message: string } }>
      }
    }

    if (data.code !== 0) {
      console.error('[parcel-tracking] 17TRACK API error code:', data.code)
      return null
    }

    const item = data.data?.accepted?.[0]
    if (!item) return null

    const t = item.track

    // Map 17TRACK status codes to our statuses
    const statusMap: Record<number, string> = {
      0: 'unknown', 10: 'pending', 20: 'in_transit', 25: 'exception',
      30: 'out_for_delivery', 35: 'exception', 40: 'delivered', 50: 'exception',
    }
    const status = statusMap[t.e] ?? 'unknown'

    // Build events from z1 array (most recent first from 17TRACK)
    const events = (t.z1 ?? []).map(ev => ({
      time: ev.a,
      location: ev.b ?? ev.c ?? '',
      description: ev.d,
    }))

    const latestEvent = t.z0?.d ?? events[0]?.description ?? ''
    const deliveredAt = status === 'delivered' ? (t.z0?.a ?? events[0]?.time ?? null) : null

    console.log('[parcel-tracking] 17TRACK result:', trackingNumber, '→', status, '| events:', events.length)

    return {
      status,
      statusDetail: latestEvent,
      events,
      estimatedDelivery: t.b ?? null,
      deliveredAt,
    }
  } catch (e) {
    console.error('[parcel-tracking] 17TRACK exception:', String(e).slice(0, 200))
    return null
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
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as {
    tracking_number: string; carrier?: string; label?: string
    direction?: string; notes?: string; reference_type?: string; reference_id?: string
    recipient_name?: string; recipient_phone?: string; recipient_address?: string
    recipient_city?: string; recipient_state?: string; recipient_postcode?: string
    order_reference?: string
  }

  if (!body.tracking_number?.trim()) return NextResponse.json({ error: 'tracking_number required' }, { status: 400 })

  const tn = body.tracking_number.trim().toUpperCase()
  const detected = detectCarrier(tn)
  const carrierCode = body.carrier ?? detected.carrier
  const carrierName = carrierCode !== 'other' ? detected.name : 'Unknown Carrier'

  const liveData = await lookup17Track(tn, carrierCode)

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
    void supabaseAdmin.from('aria_actions').insert({
      business_id: bid, category: 'delivery', priority: 'high',
      title: `Delivery exception: ${tn}`, status: 'pending', source: 'parcel_tracking',
      recommendation: `Parcel ${tn} (${carrierName}) has an exception. Contact carrier or recipient.`,
      payload: { tracking_number: tn, carrier: carrierName },
    })
  }

  return NextResponse.json({ parcel: data })
}

// PATCH — refresh tracking, manual status override, or update fields
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

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

  if (body.refresh) {
    const liveData = await lookup17Track(existing.tracking_number, existing.carrier)
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
        void supabaseAdmin.from('aria_actions').insert({
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
          action: 'delivered', user_id: user.id,
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
  return NextResponse.json({ parcel: data })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { id } = await req.json() as { id: string }
  await supabaseAdmin.from('pos_parcel_tracking').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/parcel-tracking', _GET)
export const POST = withErrorCapture('pos/parcel-tracking', _POST)
export const PATCH = withErrorCapture('pos/parcel-tracking', _PATCH)
export const DELETE = withErrorCapture('pos/parcel-tracking', _DELETE)
