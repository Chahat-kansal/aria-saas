export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const business_id = url.searchParams.get('business_id');
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let q = supabaseAdmin.from('bookings')
    .select('*')
    .eq('business_id', business_id)
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true })
    .limit(200);
  if (date) q = (q as typeof q).eq('booking_date', date);
  if (status) q = (q as typeof q).eq('status', status);
  const { data, error: e } = await q;
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ bookings: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { business_id, service_id, customer_name, customer_email, customer_phone, booking_date, booking_time, party_size, duration_minutes, notes, deposit_amount } = body;
  if (!business_id || !booking_date || !customer_name) return NextResponse.json({ error: 'business_id, booking_date, customer_name required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id as string)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error: e } = await supabaseAdmin.from('bookings').insert({
    business_id, service_id: service_id || null, customer_name, customer_email: customer_email || null,
    customer_phone: customer_phone || null, booking_date, booking_time: booking_time || null,
    party_size: party_size || 1, duration_minutes: duration_minutes || 60,
    notes: notes || null, status: 'confirmed', source: 'manual',
    deposit_amount: deposit_amount || null, confirmed_at: new Date().toISOString(),
  }).select().single();

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ booking: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const { id, business_id, status, cancellation_reason, aria_notes, ...rest } = body;
  if (!id || !business_id) return NextResponse.json({ error: 'id and business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id as string)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), ...rest };
  if (status) {
    update.status = status;
    if (status === 'cancelled') { update.cancelled_at = new Date().toISOString(); update.cancellation_reason = cancellation_reason || null; }
  }
  if (aria_notes) update.aria_notes = aria_notes;

  const { data, error: e } = await supabaseAdmin.from('bookings').update(update).eq('id', id as string).eq('business_id', business_id as string).select().single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ booking: data });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const business_id = searchParams.get('business_id');
  if (!id || !business_id) return NextResponse.json({ error: 'id and business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.from('bookings').delete().eq('id', id).eq('business_id', business_id);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('bookings', _GET)
export const POST = withErrorCapture('bookings', _POST)
export const PATCH = withErrorCapture('bookings', _PATCH)
export const DELETE = withErrorCapture('bookings', _DELETE)
