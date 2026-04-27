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

  const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom  = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioToken || !twilioFrom) {
    return NextResponse.json({
      error: 'SMS not configured',
      message: 'Twilio credentials are not set. Configure SMS in Settings before sending review requests.',
      sms_sent: false,
      code: 'TWILIO_NOT_CONFIGURED',
    }, { status: 503 });
  }

  if (!customer.phone) {
    return NextResponse.json({
      error: 'No phone number',
      message: `${customer.name} has no phone number on file. Add a phone number before sending SMS.`,
      sms_sent: false,
      code: 'NO_PHONE',
    }, { status: 400 });
  }

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

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const body = new URLSearchParams({ From: twilioFrom, To: customer.phone, Body: messageText });
    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const twilioData = await res.json();

    if (!res.ok) {
      await supabase.from('campaigns').insert({
        business_id: businessId,
        customer_id: customerId,
        type: 'review_request',
        message: messageText,
        sms_sent: false,
        error: twilioData?.message ?? 'Twilio rejected the request',
        failed_at: new Date().toISOString(),
      });

      await supabase.from('activity_log').insert({
        business_id: businessId,
        action_type: 'review',
        description: `Review request SMS to ${customer.name} FAILED: ${twilioData?.message ?? 'Unknown error'}`,
        metadata: { customerId, smsSent: false },
      });

      return NextResponse.json({
        error: 'SMS delivery failed',
        message: twilioData?.message ?? 'Twilio rejected the request',
        sms_sent: false,
      }, { status: 500 });
    }

    await supabase.from('reviews').insert({
      business_id: businessId,
      customer_id: customerId,
      platform: 'google',
      request_sent_at: new Date().toISOString(),
    });

    await supabase.from('campaigns').insert({
      business_id: businessId,
      customer_id: customerId,
      type: 'review_request',
      message: messageText,
      sms_sent: true,
      twilio_sid: twilioData.sid,
      sent_at: new Date().toISOString(),
    });

    await supabase.from('activity_log').insert({
      business_id: businessId,
      action_type: 'review',
      description: `Review request SMS sent to ${customer.name} (${customer.phone})`,
      metadata: { customerId, smsSent: true, sid: twilioData.sid },
    });

    return NextResponse.json({ success: true, message: messageText, sms_sent: true, sid: twilioData.sid });
  } catch (twilioErr) {
    const errMsg = twilioErr instanceof Error ? twilioErr.message : 'Unknown error';

    await supabase.from('campaigns').insert({
      business_id: businessId,
      customer_id: customerId,
      type: 'review_request',
      message: messageText,
      sms_sent: false,
      error: errMsg,
      failed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      error: 'SMS delivery failed',
      message: errMsg,
      sms_sent: false,
    }, { status: 500 });
  }
}
