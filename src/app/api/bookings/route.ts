export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
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

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: e } = await supabase
    .from('bookings')
    .select('*')
    .eq('business_id', business_id)
    .order('booking_date', { ascending: false })
    .limit(100);

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ bookings: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { business_id } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: e } = await supabase
    .from('bookings')
    .insert({ ...body })
    .select()
    .single();

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });

  // Optional: send confirmation SMS if Twilio configured and phone provided
  const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom  = process.env.TWILIO_PHONE_NUMBER;
  if (twilioSid && twilioToken && twilioFrom && body.phone) {
    const { data: biz } = await supabase.from('businesses').select('name').eq('id', business_id).single();
    const msg = `Hi ${body.customer_name ?? 'there'}, your booking at ${biz?.name ?? 'us'} is confirmed for ${body.booking_date ? new Date(body.booking_date).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : 'the scheduled time'}. See you then!`;
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: twilioFrom, To: body.phone, Body: msg }),
    }).catch(() => null);
  }

  return NextResponse.json({ booking: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { business_id } = body;
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: e } = await supabase.from('bookings').update(body).eq('id', id).eq('business_id', business_id);
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true });
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
