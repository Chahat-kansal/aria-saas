import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { customerId, businessId } = await req.json();
  if (!customerId || !businessId) return NextResponse.json({ error: 'customerId and businessId required' }, { status: 400 });

  const [{ data: business }, { data: customer }] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', businessId).eq('user_id', user.id).single(),
    supabase.from('customers').select('*').eq('id', customerId).eq('business_id', businessId).single(),
  ]);

  if (!business || !customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const prompt = `Write a short, friendly review request SMS (max 160 chars) for:
Customer: ${customer.name}
Business: ${business.name} (${business.industry})
${business.google_business_url ? `Google Business URL: ${business.google_business_url}` : ''}
Keep it warm and personal. Ask them to share their experience. Return ONLY the SMS text.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const messageText = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();

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

  // Update review request_sent_at
  await supabase.from('reviews').insert({
    business_id: businessId,
    customer_id: customerId,
    platform: 'google',
    request_sent_at: new Date().toISOString(),
  });

  await supabase.from('campaigns').insert({
    business_id: businessId,
    type: 'review_request',
    status: 'sent',
    sent_count: 1,
    scheduled_for: new Date().toISOString(),
  });

  await supabase.from('activity_log').insert({
    business_id: businessId,
    action_type: 'review',
    description: `Review request sent to ${customer.name}${smsSent ? ' via SMS' : ''}`,
    metadata: { customerId, smsSent },
  });

  return NextResponse.json({ success: true, message: messageText, smsSent });
}
