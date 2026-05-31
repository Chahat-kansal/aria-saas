export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendSMS } from '@/lib/clicksend'
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await checkRateLimit('messaging', user.id);
  if (!rl.ok) return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });

  const body = await req.json();
  let customerId = body.customerId;
  let businessId = body.businessId;

  // Support review_id lookup — fetch customer from review record
  if (!customerId && body.review_id) {
    const { data: reviewRow } = await supabase
      .from('reviews')
      .select('customer_id, business_id')
      .eq('id', body.review_id)
      .maybeSingle();
    if (reviewRow) {
      customerId = reviewRow.customer_id;
      businessId = reviewRow.business_id;
    }
  }

  if (!customerId || !businessId) return NextResponse.json({ error: 'customerId and businessId required (or review_id)' }, { status: 400 });

  const [{ data: business }, { data: customer }] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', businessId).eq('user_id', user.id).single(),
    supabase.from('pos_customers').select('*').eq('id', customerId).eq('business_id', businessId).single(),
  ]);

  if (!business || !customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });



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

  const response = await trackAICall({ route: 'aria/review-request', model: 'claude-haiku-4-5-20251001', businessId: businessId, purpose: 'review-request-sms' }, () => anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
      temperature: 0.75,
    system: `${ARIA_VOICE}\n\nWrite concise, warm review request SMS messages. Return ONLY the SMS text, no explanation.`,
    messages: [{ role: 'user', content: prompt }],
  }));

  const messageText = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();

  try {
    const smsResult = await sendSMS(customer.phone, messageText);

    if (!smsResult.ok) {
      await supabase.from('campaigns').insert({
        business_id: businessId,
        customer_id: customerId,
        type: 'review_request',
        message: messageText,
        sms_sent: false,
        error: smsResult.error ?? 'SMS failed',
        failed_at: new Date().toISOString(),
      });
      await supabase.from('activity_log').insert({
        business_id: businessId,
        action_type: 'review',
        description: `Review request SMS to ${customer.name} FAILED: ${smsResult.error ?? 'Unknown error'}`,
        metadata: { customerId, smsSent: false },
      });
      return NextResponse.json({ error: 'SMS delivery failed', message: smsResult.error ?? 'SMS failed', sms_sent: false }, { status: 500 });
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
      sent_at: new Date().toISOString(),
    });

    await supabase.from('activity_log').insert({
      business_id: businessId,
      action_type: 'review',
      description: `Review request SMS sent to ${customer.name} (${customer.phone})`,
      metadata: { customerId, smsSent: true },
    });

    return NextResponse.json({ success: true, message: messageText, sms_sent: true });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    await supabase.from('campaigns').insert({
      business_id: businessId,
      customer_id: customerId,
      type: 'review_request',
      message: messageText,
      sms_sent: false,
      error: errMsg,
      failed_at: new Date().toISOString(),
    });
    return NextResponse.json({ error: 'SMS delivery failed', message: errMsg, sms_sent: false }, { status: 500 });
  }
}

export const POST = withErrorCapture('aria/review-request', _POST)
