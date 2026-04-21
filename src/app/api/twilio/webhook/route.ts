import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Receives inbound SMS replies from Twilio (winback / review request responses)
export async function POST(req: Request) {
  const form = await req.formData();
  const from = form.get('From') as string;
  const body = (form.get('Body') as string ?? '').trim().toLowerCase();

  if (!from) return new Response('', { status: 200 });

  // Find the customer by phone number
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, business_id, name')
    .eq('phone', from)
    .single();

  if (customer) {
    await supabaseAdmin.from('activity_log').insert({
      business_id: customer.business_id,
      type: 'sms_reply',
      description: `SMS reply from ${customer.name ?? from}: "${form.get('Body')}"`,
      metadata: { from, body: form.get('Body'), customer_id: customer.id },
    });
  }

  // Respond with empty TwiML — no auto-reply
  return new Response('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}