export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function sendTwilio(from: string, to: string, body: string, sid: string, token: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  const data = await res.json();
  return { ok: res.ok, sid: data.sid, error: data.message };
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  // Support both batch (customer_ids) and single (customerId) modes
  const business_id = body.business_id ?? body.businessId;
  const isBatch = Array.isArray(body.customer_ids);
  const singleCustomerId = body.customerId;

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: business } = await supabase.from('businesses').select('*').eq('id', business_id).eq('user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom  = process.env.TWILIO_PHONE_NUMBER;
  const twilioConfigured = !!(twilioSid && twilioToken && twilioFrom);

  // === BATCH MODE ===
  if (isBatch) {
    const customerIds: string[] = body.customer_ids;
    const message: string = body.message;
    if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 });

    const { data: customers } = await supabase.from('customers')
      .select('id, name, phone')
      .eq('business_id', business_id)
      .in('id', customerIds);

    let sent = 0; let errors = 0;
    for (const c of customers ?? []) {
      if (!c.phone) continue;
      let smsOk = false; let smsSid: string | null = null; let smsError: string | null = null;

      if (twilioConfigured) {
        const result = await sendTwilio(twilioFrom!, c.phone, message, twilioSid!, twilioToken!);
        smsOk = result.ok;
        smsSid = result.sid ?? null;
        smsError = result.error ?? null;
        if (smsOk) sent++; else errors++;
      } else {
        // Log as pending_twilio
        smsOk = false; smsError = 'Twilio not configured';
      }

      await supabase.from('campaigns').insert({
        business_id,
        customer_id: c.id,
        type: 'winback',
        message,
        sms_sent: smsOk,
        status: smsOk ? 'sent' : (twilioConfigured ? 'failed' : 'pending_twilio'),
        twilio_sid: smsSid,
        error: smsError,
        sent_at: smsOk ? new Date().toISOString() : null,
        failed_at: (!smsOk && twilioConfigured) ? new Date().toISOString() : null,
      }).then(() => null, () => null);
    }

    if (!twilioConfigured) {
      await supabase.from('activity_log').insert({
        business_id,
        action_type: 'winback',
        description: `Winback campaign queued for ${customerIds.length} customers (Twilio not configured)`,
      }).then(() => null, () => null);
      return NextResponse.json({ sent: 0, errors: 0, customers_targeted: customerIds.length, pending_twilio: true, message_used: message });
    }

    await supabase.from('activity_log').insert({
      business_id,
      action_type: 'winback',
      description: `Winback campaign sent to ${sent} customers (${errors} failed)`,
    }).then(() => null, () => null);

    return NextResponse.json({ sent, errors, customers_targeted: customerIds.length, message_used: message });
  }

  // === SINGLE MODE (legacy) ===
  const customerId = singleCustomerId;
  if (!customerId) return NextResponse.json({ error: 'customer_ids or customerId required' }, { status: 400 });

  const { data: customer } = await supabase.from('customers').select('*').eq('id', customerId).eq('business_id', business_id).single();
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  if (!twilioConfigured) {
    await supabase.from('campaigns').insert({ business_id, customer_id: customerId, type: 'winback', status: 'pending_twilio', sms_sent: false }).then(() => null, () => null);
    return NextResponse.json({ error: 'SMS not configured', code: 'TWILIO_NOT_CONFIGURED', sms_sent: false }, { status: 503 });
  }
  if (!customer.phone) return NextResponse.json({ error: 'No phone number', sms_sent: false, code: 'NO_PHONE' }, { status: 400 });

  const daysSince = customer.last_visit ? Math.floor((Date.now() - new Date(customer.last_visit).getTime()) / 86400000) : null;
  let messageText = body.message ?? '';
  if (!messageText) {
    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const response = 
await trackAICall({ route: 'aria/winback', model: 'claude-sonnet-4-6', businessId: business_id, purpose: 'winback-sms-draft' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 200,
      temperature: 0.75,
      system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: `Write a short, friendly winback SMS (max 160 chars) for customer: ${customer.name}, business: ${business.name} (${business.industry}), days since last visit: ${daysSince ?? 'unknown'}. Include a personalised offer.` }],
    }));
    messageText = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  }

  const result = await sendTwilio(twilioFrom!, customer.phone, messageText, twilioSid!, twilioToken!);

  await supabase.from('campaigns').insert({
    business_id, customer_id: customerId, type: 'winback', message: messageText,
    sms_sent: result.ok, twilio_sid: result.sid ?? null, error: result.error ?? null,
    sent_at: result.ok ? new Date().toISOString() : null,
    failed_at: !result.ok ? new Date().toISOString() : null,
    status: result.ok ? 'sent' : 'failed',
  }).then(() => null, () => null);

  await supabase.from('activity_log').insert({
    business_id, action_type: 'winback',
    description: result.ok ? `Winback SMS sent to ${customer.name}` : `Winback SMS to ${customer.name} FAILED`,
  }).then(() => null, () => null);

  if (!result.ok) {
    Sentry.captureException(new Error(`Twilio delivery failed: ${result.error}`), {
      tags: { route: 'aria/winback' },
      extra: { business_id, customer_id: customerId },
    });
    return NextResponse.json({ error: 'SMS delivery failed', message: result.error, sms_sent: false }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: messageText, sms_sent: true, sid: result.sid });
}

export const POST = withErrorCapture('aria/winback', _POST)
