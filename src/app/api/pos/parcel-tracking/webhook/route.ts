export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// 17TRACK pushes to this endpoint automatically when carrier updates a parcel
// Setup: 17TRACK dashboard → Settings → Webhooks → https://www.ariaos.site/api/pos/parcel-tracking/webhook
// 17TRACK webhook payload: https://api.17track.net/docs#webhooks

const STATUS_MAP: Record<number, string> = {
  0: 'unknown', 10: 'pending', 20: 'in_transit', 25: 'exception',
  30: 'out_for_delivery', 35: 'exception', 40: 'delivered', 50: 'exception',
}

export async function POST(req: Request) {
  try {
    // 17TRACK sends an array of tracking updates
    const body = await req.json() as Array<{
      number: string
      track: {
        e: number  // status code
        b?: string // estimated delivery
        z0?: { a: string; d: string } // latest event
        z1?: Array<{ a: string; b?: string; c?: string; d: string }> // all events
      }
    }> | {
      // Single update format
      number?: string
      track?: { e: number; b?: string; z0?: { a: string; d: string }; z1?: Array<{ a: string; b?: string; c?: string; d: string }> }
    }

    // Normalize to array
    const updates = Array.isArray(body) ? body : (body.number ? [body as { number: string; track: typeof body.track }] : [])

    for (const update of updates) {
      if (!update.number || !update.track) continue

      const t = update.track
      const status = STATUS_MAP[t.e] ?? 'unknown'
      const events = (t.z1 ?? []).map(ev => ({
        time: ev.a, location: ev.b ?? ev.c ?? '', description: ev.d,
      }))
      const latestEvent = t.z0?.d ?? events[0]?.description ?? ''
      const deliveredAt = status === 'delivered' ? (t.z0?.a ?? events[0]?.time ?? null) : null

      const updates_obj: Record<string, unknown> = {
        status, status_detail: latestEvent, events,
        estimated_delivery: t.b ?? null,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (deliveredAt) updates_obj.delivered_at = deliveredAt
      if (events[0]?.time) updates_obj.last_event_at = new Date(events[0].time).toISOString()

      await supabaseAdmin.from('pos_parcel_tracking')
        .update(updates_obj)
        .ilike('tracking_number', update.number.toUpperCase())

      // Autopilot action on exception
      if (status === 'exception') {
        const { data: parcels } = await supabaseAdmin
          .from('pos_parcel_tracking')
          .select('business_id, carrier_name')
          .ilike('tracking_number', update.number.toUpperCase())
          .neq('status', 'exception')
          .limit(1)
        if (parcels?.[0]) {
          void supabaseAdmin.from('aria_actions').insert({
            business_id: parcels[0].business_id, category: 'delivery', priority: 'high',
            title: `Delivery exception: ${update.number}`, status: 'pending', source: 'parcel_webhook',
            recommendation: `Parcel ${update.number} has a delivery exception. Contact ${parcels[0].carrier_name ?? 'the carrier'}.`,
            payload: { tracking_number: update.number },
          })
        }
      }

      console.log(`[parcel-webhook] Updated ${update.number} → ${status}`)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[parcel-webhook] Error:', String(e).slice(0, 200))
    return NextResponse.json({ ok: true }) // always 200 to 17TRACK
  }
}
