import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { customerId, businessId } = await req.json();
  if (!customerId || !businessId) return NextResponse.json({ error: 'customerId and businessId required' }, { status: 400 });

  const [{ data: business }, { data: customer }] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', businessId).eq('user_id', session.user.id).single(),
    supabase.from('customers').select('*').eq('id', customerId).eq('business_id', businessId).single(),
  ]);

  if (!business || !customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const daysSince = customer.last_visit
    ? Math.floor((Date.now() - new Date(customer.last_visit).getTime()) / 86400000)
    : null;

  const prompt = `Write a short, friendly winback SMS (max 160 chars) for:
Customer: ${customer.name}
Business: ${business.name} (${business.industry})
Days since last visit: ${daysSince || 'unknown'}
Include a personalised offer and a short call to action. Do not include a URL (we'll add that separately). Return ONLY the SMS text.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const messageText = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();

  // Send SMS via Twilio if configured
  let smsSent = false;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && customer.phone) {
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const body = new URLSearchParams({
        From: process.env.TWILIO_PHONE_NUMBER!,
        To: customer.phone,
        Body: messageText,
      });
      const res = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      smsSent = res.ok;
    } catch {}
  }

  // Create campaign record
  await supabase.from('campaigns').insert({
    business_id: businessId,
    type: 'winback',
    status: 'sent',
    sent_count: 1,
    scheduled_for: new Date().toISOString(),
  });

  // Log activity
  await supabase.from('activity_log').insert({
    business_id: businessId,
    action_type: 'winback',
    description: `Winback message sent to ${customer.name}${smsSent ? ' via SMS' : ' (SMS not configured)'}`,
    metadata: { customerId, smsSent },
  });

  return NextResponse.json({ success: true, message: messageText, smsSent });
}
