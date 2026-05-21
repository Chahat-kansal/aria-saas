export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Daily cron at 6am — syncs all active parcels with TrackingMore
// Catches anything the webhook missed
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { lookupTrackingMore } from '@/app/api/pos/parcel-tracking/route'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all active (non-delivered, non-exception) parcels
  const { data: parcels } = await supabaseAdmin
    .from('pos_parcel_tracking')
    .select('id, business_id, tracking_number, carrier, status')
    .not('status', 'in', '("delivered","exception")')
    .order('last_checked_at', { ascending: true })
    .limit(100)

  if (!parcels?.length) return NextResponse.json({ synced: 0 })

  let synced = 0
  let exceptions = 0

  for (const parcel of parcels) {
    const liveData = await lookupTrackingMore(parcel.tracking_number, parcel.carrier)
    if (!liveData) continue

    const updates: Record<string, unknown> = {
      status: liveData.status, status_detail: liveData.statusDetail,
      events: liveData.events, estimated_delivery: liveData.estimatedDelivery,
      last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    if (liveData.deliveredAt) updates.delivered_at = liveData.deliveredAt
    if (liveData.events?.[0]?.time) updates.last_event_at = new Date(liveData.events[0].time).toISOString()

    await supabaseAdmin.from('pos_parcel_tracking').update(updates).eq('id', parcel.id)

    // Create autopilot action if newly in exception
    if (liveData.status === 'exception' && parcel.status !== 'exception') {
      exceptions++
      void supabaseAdmin.from('aria_actions').insert({
        business_id: parcel.business_id, category: 'delivery', priority: 'high',
        title: `Delivery exception: ${parcel.tracking_number}`, status: 'pending',
        source: 'parcel_sync_cron',
        recommendation: `Parcel ${parcel.tracking_number} has an exception — check with the carrier.`,
        payload: { tracking_number: parcel.tracking_number },
      })
    }

    synced++
    // Small delay to respect TrackingMore rate limits
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`[parcel-sync] Synced ${synced} parcels, ${exceptions} new exceptions`)
  return NextResponse.json({ synced, exceptions })
}
