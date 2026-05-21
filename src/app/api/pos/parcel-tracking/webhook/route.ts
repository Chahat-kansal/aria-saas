export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// TrackingMore pushes to this endpoint automatically when carrier status changes
// Setup: TrackingMore Dashboard → Settings → Webhooks → https://www.ariaos.site/api/pos/parcel-tracking/webhook

const STATUS_MAP: Record<string, string> = {
  notfound: 'pending', pending: 'pending', transit: 'in_transit',
  pickup: 'out_for_delivery', delivered: 'delivered',
  undelivered: 'exception', exception: 'exception', expired: 'exception',
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      tracking_number?: string
      courier_code?: string
      delivery_status?: string
      latest_event?: string
      latest_event_time?: string
      expected_delivery?: string
      origin_info?: { trackinfo?: Array<{ StatusDescription: string; Details: string; Date: string }> }
      destination_info?: { trackinfo?: Array<{ StatusDescription: string; Details: string; Date: string }> }
    }

    const tn = body.tracking_number
    if (!tn) return NextResponse.json({ ok: true }) // ignore malformed

    const status = STATUS_MAP[body.delivery_status ?? ''] ?? 'unknown'
    const rawEvents = [
      ...(body.destination_info?.trackinfo ?? []),
      ...(body.origin_info?.trackinfo ?? []),
    ]
    const events = rawEvents.map(ev => ({
      time: ev.Date, location: ev.Details ?? '', description: ev.StatusDescription,
    }))

    const updates: Record<string, unknown> = {
      status,
      status_detail: body.latest_event ?? null,
      events,
      estimated_delivery: body.expected_delivery ?? null,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (status === 'delivered' && body.latest_event_time) {
      updates.delivered_at = body.latest_event_time
    }
    if (events[0]?.time) updates.last_event_at = new Date(events[0].time).toISOString()

    // Update all parcels with this tracking number (could be across multiple businesses)
    await supabaseAdmin.from('pos_parcel_tracking')
      .update(updates)
      .ilike('tracking_number', tn.toUpperCase())

    console.log(`[parcel-webhook] Updated ${tn} → ${status}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[parcel-webhook] Error:', String(e).slice(0, 200))
    return NextResponse.json({ ok: true }) // always 200 to TrackingMore
  }
}
