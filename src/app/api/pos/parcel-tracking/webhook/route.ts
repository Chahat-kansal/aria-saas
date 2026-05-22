export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// TrackingMore pushes here automatically whenever a carrier updates a parcel.
// Setup: TrackingMore dashboard -> Webhook -> https://www.ariaos.site/api/pos/parcel-tracking/webhook
// Payload: { event: 'TRACKING_UPDATED', data: { tracking_number, status, origin_info, ... } }

// TrackingMore status strings -> our internal status values.
const STATUS_MAP: Record<string, string> = {
  pending: 'pending', notfound: 'pending', inforeceived: 'pending',
  transit: 'in_transit', pickup: 'awaiting_collection',
  delivered: 'delivered', undelivered: 'exception',
  exception: 'exception', expired: 'exception',
}

interface TMTrackEvent {
  Date?: string; StatusDescription?: string; Details?: string
  checkpoint_status?: string; location?: string
}
interface TMData {
  tracking_number?: string
  status?: string
  latest_event?: string
  scheduled_delivery_date?: string | null
  expected_delivery?: string | null
  origin_info?: { trackinfo?: TMTrackEvent[] }
  destination_info?: { trackinfo?: TMTrackEvent[] }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as
      | { event?: string; data?: TMData | TMData[] }
      | TMData
      | TMData[]

    // Normalise the payload to a flat array of TMData objects.
    let items: TMData[] = []
    if (Array.isArray(body)) {
      items = body as TMData[]
    } else if (body && typeof body === 'object' && 'data' in body && body.data) {
      items = Array.isArray(body.data) ? body.data : [body.data]
    } else if (body && typeof body === 'object' && 'tracking_number' in body) {
      items = [body as TMData]
    }

    for (const d of items) {
      if (!d.tracking_number) continue

      const status = STATUS_MAP[(d.status ?? '').toLowerCase()] ?? 'pending'
      const raw: TMTrackEvent[] = [
        ...(d.destination_info?.trackinfo ?? []),
        ...(d.origin_info?.trackinfo ?? []),
      ]
      const events = raw
        .map(ev => ({
          time: ev.Date ?? '',
          location: ev.Details ?? ev.location ?? '',
          description: ev.StatusDescription ?? '',
        }))
        .filter(e => e.time || e.description)
        .sort((a, b) => (b.time || '').localeCompare(a.time || ''))

      const latestEvent = d.latest_event ?? events[0]?.description ?? (d.status ?? '')
      const deliveredAt = status === 'delivered' ? (events[0]?.time ?? null) : null

      const updateObj: Record<string, unknown> = {
        status,
        status_detail: latestEvent,
        events,
        estimated_delivery: d.scheduled_delivery_date ?? d.expected_delivery ?? null,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (deliveredAt) updateObj.delivered_at = deliveredAt
      if (events[0]?.time) updateObj.last_event_at = new Date(events[0].time).toISOString()

      await supabaseAdmin.from('pos_parcel_tracking')
        .update(updateObj)
        .ilike('tracking_number', d.tracking_number.toUpperCase())

      // Raise an autopilot action the first time a parcel hits an exception.
      if (status === 'exception') {
        const { data: parcels } = await supabaseAdmin
          .from('pos_parcel_tracking')
          .select('business_id, carrier_name')
          .ilike('tracking_number', d.tracking_number.toUpperCase())
          .neq('status', 'exception')
          .limit(1)
        if (parcels?.[0]) {
          void supabaseAdmin.from('aria_actions').insert({
            business_id: parcels[0].business_id, category: 'delivery', priority: 'high',
            title: `Delivery exception: ${d.tracking_number}`, status: 'pending', source: 'parcel_webhook',
            recommendation: `Parcel ${d.tracking_number} has a delivery exception. Contact ${parcels[0].carrier_name ?? 'the carrier'}.`,
            payload: { tracking_number: d.tracking_number },
          })
        }
      }

      console.log(`[parcel-webhook] Updated ${d.tracking_number} -> ${status}`)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[parcel-webhook] Error:', String(e).slice(0, 200))
    return NextResponse.json({ ok: true }) // always 200 so the provider does not retry-storm
  }
}
