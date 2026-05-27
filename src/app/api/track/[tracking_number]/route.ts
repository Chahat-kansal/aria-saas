export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET(_req: Request, { params }: { params: { tracking_number: string } }) {
  const tn = params.tracking_number;
  if (!tn) return NextResponse.json({ error: 'tracking_number required' }, { status: 400 });

  // Public lookup — no auth, only return safe fields
  const { data: parcel } = await supabaseAdmin.from('pos_parcel_tracking')
    .select('tracking_number, carrier, carrier_name, status, status_detail, events, estimated_delivery, delivered_at, last_event_at, created_at, business_id, recipient_name, recipient_city, recipient_state, recipient_postcode')
    .eq('tracking_number', tn)
    .maybeSingle();

  if (!parcel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('name, phone, address, city, google_average_rating')
    .eq('id', parcel.business_id as string).maybeSingle();

  return NextResponse.json({
    parcel: {
      tracking_number: parcel.tracking_number,
      carrier: parcel.carrier,
      carrier_name: parcel.carrier_name,
      status: parcel.status,
      status_detail: parcel.status_detail,
      events: parcel.events ?? [],
      estimated_delivery: parcel.estimated_delivery,
      delivered_at: parcel.delivered_at,
      last_event_at: parcel.last_event_at,
      created_at: parcel.created_at,
      recipient_city: parcel.recipient_city,
      recipient_state: parcel.recipient_state,
    },
    business: biz ? { name: biz.name, phone: biz.phone, city: biz.city } : null,
  });
}

export const GET = withErrorCapture('track/public', _GET);
