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

// ── Carrier detection ──────────────────────────────────────────────────
const CARRIER_PATTERNS: Array<{ pattern: RegExp; carrier: string; name: string }> = [
  { pattern: /^[A-Z]{2}\d{9}AU$/i,           carrier: 'auspost',        name: 'Australia Post' },
  { pattern: /^\d{11,13}$/,                   carrier: 'auspost',        name: 'Australia Post' },
  { pattern: /^33\d{10}$/,                    carrier: 'aramex',         name: 'Aramex' },
  { pattern: /^3933\d{8}$/,                   carrier: 'aramex',         name: 'Aramex' },
  { pattern: /^\d{10}$/,                      carrier: 'startrack',      name: 'StarTrack' },
  { pattern: /^[0-9]{12}$/,                   carrier: 'dhl',            name: 'DHL Express' },
  { pattern: /^[0-9]{20}$/,                   carrier: 'fedex',          name: 'FedEx' },
  { pattern: /^[0-9]{18}$/,                   carrier: 'couriersplease', name: "Couriers Please" },
  { pattern: /^[A-Z]{2}\d{8}/i,              carrier: 'tnt',            name: 'TNT' },
]

function detectCarrier(trackingNumber: string): { carrier: string; name: string } {
  const tn = trackingNumber.trim()
  for (const cp of CARRIER_PATTERNS) {
    if (cp.pattern.test(tn)) return { carrier: cp.carrier, name: cp.name }
  }
  return { carrier: 'other', name: 'Unknown Carrier' }
}

// ── Track17 API lookup ─────────────────────────────────────────────────
// Free tier: 100 requests/day, 1200+ carriers including all AU carriers
// Sign up at: https://www.track17.com/
async function lookupTrack17(trackingNumber: string, carrierCode?: string): Promise<{
  status: string
  statusDetail: string
  events: Array<{ time: string; location: string; description: string }>
  estimatedDelivery: string | null
  deliveredAt: string | null
} | null> {
  const apiKey = process.env.TRACK17_API_KEY
  if (!apiKey || apiKey === 'false') {
    console.log('[parcel-tracking] Track17 API key not set')
    return null
  }

  try {
    // Register tracking number first
    await fetch('https://api.track17.com/track/v2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '17token': apiKey },
      body: JSON.stringify([{ number: trackingNumber, carrier: carrierCode ?? '' }]),
      signal: AbortSignal.timeout(10_000),
    })

    // Then fetch status
    const res = await fetch('https://api.track17.com/track/v2/gettracklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '17token': apiKey },
      body: JSON.stringify([{ number: trackingNumber }]),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return null
    const data = await res.json() as {
      data?: {
        accepted?: Array<{
          number: string
          track: {
            e: number // status code
            z0?: { a: string; d: string } // current status
            z1?: Array<{ a: string; b: string; c: string; d: string }> // events
            b?: string // estimated delivery
          }
        }>
      }
    }

    const item = data.data?.accepted?.[0]
    if (!item) return null

    const t = item.track
    // Map Track17 status codes
    const statusMap: Record<number, string> = {
      0: 'unknown', 10: 'pending', 20: 'in_transit', 30: 'out_for_delivery',
      40: 'delivered', 50: 'exception', 60: 'exception', 70: 'exception',
    }
    const status = statusMap[t.e] ?? 'unknown'
    const events = (t.z1 ?? []).map(ev => ({
      time: ev.a, location: ev.b ?? '', description: ev.d,
    }))

    return {
      status,
      statusDetail: t.z0?.d ?? '',
      events,
      estimatedDelivery: t.b ?? null,
      deliveredAt: status === 'delivered' ? (events[0]?.time ?? null) : null,
    }
  } catch (e) {
    console.error('[parcel-tracking] Track17 error:', String(e).slice(0, 200))
    return null
  }
}

// ── GET: list all parcels ──────────────────────────────────────────────
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ parcels: [] })

  const { searchParams } = new URL(req.url)
  const direction = searchParams.get('direction') // inbound | outbound | null (all)
  const status = searchParams.get('status')       // active | delivered | all

  let q = supabaseAdmin.from('pos_parcel_tracking')
    .select('*').eq('business_id', bid).order('created_at', { ascending: false }).limit(100)

  if (direction) q = q.eq('direction', direction)
  if (status === 'active') q = q.not('status', 'in', '("delivered","exception")')
  else if (status === 'delivered') q = q.eq('status', 'delivered')

  const { data } = await q
  return NextResponse.json({ parcels: data ?? [] })
}

// ── POST: add tracking number ──────────────────────────────────────────
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as {
    tracking_number: string
    carrier?: string
    label?: string
    direction?: string
    notes?: string
    reference_type?: string
    reference_id?: string
  }

  if (!body.tracking_number?.trim()) {
    return NextResponse.json({ error: 'tracking_number required' }, { status: 400 })
  }

  const tn = body.tracking_number.trim().toUpperCase()

  // Auto-detect carrier if not provided
  const detected = detectCarrier(tn)
  const carrierCode = body.carrier ?? detected.carrier
  const carrierName = carrierCode !== 'other' ? detected.name : 'Unknown Carrier'

  // Attempt live lookup immediately
  const liveData = await lookupTrack17(tn, carrierCode)

  const { data, error } = await supabaseAdmin.from('pos_parcel_tracking').insert({
    business_id: bid,
    tracking_number: tn,
    carrier: carrierCode,
    carrier_name: carrierName,
    label: body.label ?? null,
    direction: body.direction ?? 'inbound',
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
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ parcel: data })
}

// ── PATCH: refresh tracking or update fields ───────────────────────────
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { id: string; refresh?: boolean; label?: string; notes?: string }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Verify ownership
  const { data: existing } = await supabaseAdmin.from('pos_parcel_tracking')
    .select('*').eq('id', body.id).eq('business_id', bid).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) updates.label = body.label
  if (body.notes !== undefined) updates.notes = body.notes

  if (body.refresh) {
    const liveData = await lookupTrack17(existing.tracking_number, existing.carrier)
    if (liveData) {
      updates.status = liveData.status
      updates.status_detail = liveData.statusDetail
      updates.events = liveData.events
      updates.estimated_delivery = liveData.estimatedDelivery
      updates.delivered_at = liveData.deliveredAt
      updates.last_checked_at = new Date().toISOString()
      if (liveData.events?.[0]?.time) {
        updates.last_event_at = new Date(liveData.events[0].time).toISOString()
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

// ── DELETE ─────────────────────────────────────────────────────────────
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
