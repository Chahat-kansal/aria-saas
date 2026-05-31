export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendSMS } from '@/lib/clicksend'
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateBody } from '@/lib/api/validate';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const SmsSchema = z.object({
  customer_id: z.string().uuid(),
  message: z.string().min(1).max(1600).transform(s => s.trim()),
})

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await checkRateLimit('messaging', user.id);
  if (!rl.ok) return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });

  const parsed = await validateBody(req, SmsSchema);
  if ('error' in parsed) return parsed.error;
  const { customer_id, message } = parsed.data;

  const { data: _ab } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (_ab?.business_id as string) ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  // Ownership: customer must belong to this business
  const { data: _cCheck } = await supabase.from('pos_customers').select('id').eq('id', customer_id).eq('business_id', bid).maybeSingle()
  if (!_cCheck) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

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

  const smsResult = await sendSMS(customer.phone, message)

  if (!smsResult.ok) {
    console.error('[sms] ClickSend error:', smsResult.error)
    return NextResponse.json({ error: 'sms_error', detail: smsResult.error }, { status: 502 })
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

export const POST = withErrorCapture('pos/customers/sms', _POST)
