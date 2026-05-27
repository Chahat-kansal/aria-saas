export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface BulkRow { tracking_number: string; carrier?: string; recipient_name?: string; recipient_phone?: string; order_reference?: string }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

function detectCarrier(tn: string): { carrier: string; name: string } {
  if (/^[A-Z]{2}\d{9}AU$/i.test(tn)) return { carrier: 'auspost', name: 'Australia Post' };
  if (/^33\d{10}$/.test(tn)) return { carrier: 'aramex', name: 'Aramex' };
  if (/^[A-Z]{2}\d{8}/i.test(tn)) return { carrier: 'tnt', name: 'TNT' };
  if (/^[0-9]{12}$/.test(tn)) return { carrier: 'dhl', name: 'DHL Express' };
  if (/^[0-9]{20,22}$/.test(tn)) return { carrier: 'fedex', name: 'FedEx' };
  if (/^\d{10}$/.test(tn)) return { carrier: 'startrack', name: 'StarTrack' };
  if (/^\d{11,13}$/.test(tn)) return { carrier: 'auspost', name: 'Australia Post' };
  return { carrier: 'other', name: 'Unknown Carrier' };
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { rows } = await req.json() as { rows: BulkRow[] };
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'rows required' }, { status: 400 });

  const inserts = rows.filter(r => r.tracking_number?.trim()).map(r => {
    const detected = r.carrier && r.carrier !== 'other' ? { carrier: r.carrier, name: r.carrier } : detectCarrier(r.tracking_number.trim());
    return {
      business_id: bid,
      tracking_number: r.tracking_number.trim(),
      carrier: detected.carrier,
      carrier_name: detected.name,
      direction: 'outbound',
      status: 'pending',
      recipient_name: r.recipient_name ?? null,
      recipient_phone: r.recipient_phone ?? null,
      order_reference: r.order_reference ?? null,
    };
  });
  if (inserts.length === 0) return NextResponse.json({ imported: 0, error: 'no valid rows' });

  const { error, count } = await supabase.from('pos_parcel_tracking').insert(inserts, { count: 'exact' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ imported: count ?? inserts.length });
}

export const POST = withErrorCapture('parcel-tracking/bulk', _POST);
