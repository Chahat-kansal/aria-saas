export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// 17TRACK pushes here automatically whenever a carrier updates a parcel.
// Setup: 17TRACK dashboard -> Settings -> Webhook -> https://www.ariaos.site/api/pos/parcel-tracking/webhook
// v2.2 payload: { event: 'TRACKING_UPDATED', data: { number, track_info: {...} } }
// This matches the v2.2 gettrackinfo shape parsed by the main route.

// 17TRACK v2.2 main status strings -> our internal status values.
const STATUS_MAP: Record<string, string> = {
  NotFound: 'pending', InfoReceived: 'pending', InTransit: 'in_transit',
  Expired: 'exception', AvailableForPickup: 'awaiting_collection',
  OutForDelivery: 'out_for_delivery', DeliveryFailure: 'exception',
  Delivered: 'delivered', Exception: 'exception',
}

interface V22Event {
  time_utc?: string | null; time_iso?: string | null
  description?: string | null; location?: string | null
}
interface V22TrackInfo {
  latest_status?: { status?: string; sub_status?: string }
  latest_event?: V22Event
  time_metrics?: { estimated_delivery_date?: { from?: string | null; to?: string | null } }
  milestone?: Array<{ key_stage?: string; time_utc?: string | null }>
  tracking?: { providers?: Array<{ events?: V22Event[] }> }
}
interface V22Accepted { number?: string; track_info?: V22TrackInfo }

export async function POST(req: Request) {
  try {
    const body = await req.json() as
      | { event?: string; data?: V22Accepted | { accepted?: V22Accepted[] } }
      | V22Accepted
      | V22Accepted[]

    // Normalise the v2.2 payload to a flat array of accepted items.
    let items: V22Accepted[] = []
    if (Array.isArray(body)) {
      items = body as V22Accepted[]
    } else if (body && typeof body === 'object' && 'data' in body && body.data) {
      const d = body.data as V22Accepted | { accepted?: V22Accepted[] }
      if ('accepted' in d && Array.isArray(d.accepted)) items = d.accepted
      else if ('number' in d) items = [d as V22Accepted]
    } else if (body && typeof body === 'object' && 'number' in body) {
      items = [body as V22Accepted]
    }

    for (const item of items) {
      const ti = item.track_info
      if (!item.number || !ti) continue

      const statusStr = ti.latest_status?.status ?? 'NotFound'
      const status = STATUS_MAP[statusStr] ?? 'pending'

      // Flatten every provider's events; newest first.
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

      const latestEvent = ti.latest_event?.description ?? events[0]?.description ?? statusStr
      let deliveredAt: string | null = null
      if (status === 'delivered') {
        const dm = (ti.milestone ?? []).find(m => m.key_stage === 'Delivered')
        deliveredAt = dm?.time_utc ?? ti.latest_event?.time_utc ?? events[0]?.time ?? null
      }
      const edd = ti.time_metrics?.estimated_delivery_date
      const estimatedDelivery = edd?.to ?? edd?.from ?? null

      const updateObj: Record<string, unknown> = {
        status,
        status_detail: latestEvent,
        events,
        estimated_delivery: estimatedDelivery,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (deliveredAt) updateObj.delivered_at = deliveredAt
      if (events[0]?.time) updateObj.last_event_at = new Date(events[0].time).toISOString()

      await supabaseAdmin.from('pos_parcel_tracking')
        .update(updateObj)
        .ilike('tracking_number', item.number.toUpperCase())

      // Raise an autopilot action the first time a parcel hits an exception.
      if (status === 'exception') {
        const { data: parcels } = await supabaseAdmin
          .from('pos_parcel_tracking')
          .select('business_id, carrier_name')
          .ilike('tracking_number', item.number.toUpperCase())
          .neq('status', 'exception')
          .limit(1)
        if (parcels?.[0]) {
          void supabaseAdmin.from('aria_actions').insert({
            business_id: parcels[0].business_id, category: 'delivery', priority: 'high',
            title: `Delivery exception: ${item.number}`, status: 'pending', source: 'parcel_webhook',
            recommendation: `Parcel ${item.number} has a delivery exception. Contact ${parcels[0].carrier_name ?? 'the carrier'}.`,
            payload: { tracking_number: item.number },
          })
        }
      }

      console.log(`[parcel-webhook] Updated ${item.number} -> ${status}`)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[parcel-webhook] Error:', String(e).slice(0, 200))
    return NextResponse.json({ ok: true }) // always 200 so 17TRACK does not retry-storm
  }
}
