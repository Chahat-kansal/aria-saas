export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action'
import { sanitizeExternalText, validTrackingNumber } from '@/lib/security/sanitize-external-text'
import { createHmac, timingSafeEqual } from 'crypto'

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


// SEC-PARCEL-2 — this endpoint was completely unauthenticated: anyone who found the URL could POST
// forged carrier events for any parcel.
//
// ⚠ THE SIGNATURE SHAPE IS UNVERIFIED. 17TRACK's signing scheme (header name, digest, whether it
// signs the raw body or a concatenation, and whether it uses the API key or a separate webhook
// secret) is documented in their dashboard and could not be confirmed from this environment. A
// wrong guess here would silently reject every real delivery update, so:
//
//   · verification is OFF unless SEVENTEEN_TRACK_VERIFY === 'true'  (default: off, current
//     behaviour preserved exactly)
//   · the header name is env-configurable (SEVENTEEN_TRACK_SIGN_HEADER, default 'sign') so a wrong
//     guess is fixed with an env change, not a redeploy
//   · every rejection is logged loudly, so a day of logs with the flag OFF shows whether real
//     payloads would have passed BEFORE it is switched on
//
// ROLLOUT: set the secret, leave the flag off, read one day of '[parcel-webhook] signature' logs,
// then set SEVENTEEN_TRACK_VERIFY=true.
function verify17TrackSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.SEVENTEEN_TRACK_WEBHOOK_SECRET
  if (!secret || !header) return false          // fail closed — no secret or no header, no writes
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(header.trim())
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  try {
    // Raw body must be read ONCE and before any .json() — the stream cannot be consumed twice, and
    // the signature is over the exact bytes sent.
    const raw = await req.text()
    const signatureOk = verify17TrackSignature(raw, req.headers.get(process.env.SEVENTEEN_TRACK_SIGN_HEADER ?? 'sign'))
    if (!signatureOk) {
      console.warn('[parcel-webhook] signature FAILED (enforcing=' + (process.env.SEVENTEEN_TRACK_VERIFY === 'true') + ')')
      // 200 either way so 17TRACK does not retry-storm; when enforcing, nothing is written.
      if (process.env.SEVENTEEN_TRACK_VERIFY === 'true') return NextResponse.json({ ok: true })
    } else {
      console.log('[parcel-webhook] signature ok')
    }

    const body = JSON.parse(raw) as
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
        // SEC-EXT-TEXT-1 — carrier-supplied free text is stored and later read by the Aria brain.
        .map(ev => ({
          time: ev.time_utc ?? ev.time_iso ?? '',
          location: sanitizeExternalText(ev.location, 120),
          description: sanitizeExternalText(ev.description, 300),
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
        status_detail: sanitizeExternalText(latestEvent),
        events,
        estimated_delivery: estimatedDelivery,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (deliveredAt) updateObj.delivered_at = deliveredAt
      if (events[0]?.time) updateObj.last_event_at = new Date(events[0].time).toISOString()

      // SEC-PARCEL-1 — this was `.ilike('tracking_number', item.number.toUpperCase())`. ilike treats
      // % and _ as wildcards and `number` arrives from an UNAUTHENTICATED webhook body, so a payload
      // of { number: "%" } matched and overwrote status/status_detail/events/estimated_delivery/
      // delivered_at on EVERY parcel row in EVERY business — a cross-tenant mass-update primitive
      // reachable by anyone who found this URL. Tracking numbers are exact identifiers, so there is
      // no reason to pattern match. All stored values are already uppercase (verified: 2/2, none
      // containing % or _), so eq() on the validated value is behaviour-identical for every real
      // payload while a wildcard payload now matches nothing.
      const trackingNumber = validTrackingNumber(item.number)
      if (!trackingNumber) {
        console.warn('[parcel-webhook] rejected non-identifier tracking number')
        continue
      }

      await supabaseAdmin.from('pos_parcel_tracking')
        .update(updateObj)
        .eq('tracking_number', trackingNumber)

      // Raise an autopilot action the first time a parcel hits an exception.
      if (status === 'exception') {
        const { data: parcels } = await supabaseAdmin
          .from('pos_parcel_tracking')
          .select('business_id, carrier_name')
          .eq('tracking_number', trackingNumber)   // SEC-PARCEL-1, same reason as the update above
          .neq('status', 'exception')
          .limit(1)
        if (parcels?.[0]) {
          void upsertAriaAction({
            business_id: parcels[0].business_id, category: 'delivery', priority: 'high',
            title: `Delivery exception: ${trackingNumber}`, status: 'pending', source: 'parcel_webhook',
            recommendation: `Parcel ${trackingNumber} has a delivery exception. Contact ${sanitizeExternalText(parcels[0].carrier_name ?? 'the carrier', 80)}.`,
            payload: { tracking_number: trackingNumber },
          })
        }
      }

      console.log(`[parcel-webhook] Updated ${trackingNumber} -> ${status}`)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[parcel-webhook] Error:', String(e).slice(0, 200))
    return NextResponse.json({ ok: true }) // always 200 so 17TRACK does not retry-storm
  }
}
