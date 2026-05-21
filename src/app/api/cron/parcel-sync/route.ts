export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { lookup17Track } from '@/app/api/pos/parcel-tracking/route'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all active parcels not yet delivered
  const { data: parcels } = await supabaseAdmin
    .from('pos_parcel_tracking')
    .select('id, business_id, tracking_number, carrier, status')
    .not('status', 'in', '("delivered","cancelled","failed")')
    .order('last_checked_at', { ascending: true })
    .limit(80) // stay under 17TRACK rate limits

  if (!parcels?.length) return NextResponse.json({ synced: 0 })

  let synced = 0, exceptions = 0, delivered = 0

  for (const parcel of parcels) {
    const liveData = await lookup17Track(parcel.tracking_number, parcel.carrier)
    if (!liveData) continue

    const updates: Record<string, unknown> = {
      status: liveData.status, status_detail: liveData.statusDetail,
      events: liveData.events, estimated_delivery: liveData.estimatedDelivery,
      last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    if (liveData.deliveredAt) updates.delivered_at = liveData.deliveredAt
    if (liveData.events?.[0]?.time) updates.last_event_at = new Date(liveData.events[0].time).toISOString()

    await supabaseAdmin.from('pos_parcel_tracking').update(updates).eq('id', parcel.id)

    if (liveData.status === 'exception' && parcel.status !== 'exception') {
      exceptions++
      void supabaseAdmin.from('aria_actions').insert({
        business_id: parcel.business_id, category: 'delivery', priority: 'high',
        title: `Delivery exception: ${parcel.tracking_number}`, status: 'pending', source: 'parcel_sync_cron',
        recommendation: `Parcel ${parcel.tracking_number} has a delivery exception. Check with the carrier.`,
        payload: { tracking_number: parcel.tracking_number },
      })
    }

    if (liveData.status === 'delivered' && parcel.status !== 'delivered') delivered++

    synced++
    // Respect 17TRACK rate limits — 40 per batch, process with delay
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`[parcel-sync] Synced ${synced}, delivered ${delivered}, exceptions ${exceptions}`)
  return NextResponse.json({ synced, delivered, exceptions })
}
