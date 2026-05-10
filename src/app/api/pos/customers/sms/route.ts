export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { customer_id, message } = await req.json() as { customer_id: string; message: string };
  if (!customer_id || !message?.trim()) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioToken || !twilioFrom) {
    return NextResponse.json({ error: 'twilio_not_configured', message: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in Vercel env vars.' }, { status: 503 });
  }

  const { data: customer } = await supabase
    .from('pos_customers')
    .select('phone, name')
    .eq('id', customer_id)
    .single();

  if (!customer?.phone) {
    return NextResponse.json({ error: 'no_phone' }, { status: 400 });
  }

  const encoded = new URLSearchParams({ To: customer.phone, From: twilioFrom, Body: message });
  const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encoded.toString(),
  });

  if (!twilioRes.ok) {
    const errBody = await twilioRes.json().catch(() => ({})) as { message?: string };
    console.error('[sms] Twilio error:', errBody);
    return NextResponse.json({ error: 'twilio_error', detail: errBody.message }, { status: 502 });
  }

  await supabase.from('pos_customer_communications').insert({
    customer_id,
    channel: 'sms',
    direction: 'outbound',
    message,
    sent_at: new Date().toISOString(),
    status: 'sent',
  }).then(() => null);

  return NextResponse.json({ ok: true });
}
