export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { validateBody } from '@/lib/api/validate';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { checkRateLimit } from '@/lib/rate-limit';
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'
import { sendSMS } from '@/lib/clicksend'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WinbackSchema = z.object({
  business_id: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
  customer_ids: z.array(z.string().uuid()).optional(),
  customerId: z.string().uuid().optional(),
  message: z.string().max(1600).optional(),
})

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await checkRateLimit('messaging', user.id);
  if (!rl.ok) return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });

  const parsed = await validateBody(req, WinbackSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  // Support both batch (customer_ids) and single (customerId) modes
  const business_id = body.business_id ?? body.businessId;
  const isBatch = Array.isArray(body.customer_ids);
  const singleCustomerId = body.customerId;

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: business } = await supabase.from('businesses').select('*').eq('id', business_id).eq('user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // === BATCH MODE ===
  if (isBatch) {
    const customerIds: string[] = body.customer_ids ?? [];
    const message: string = body.message ?? '';
    if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 });

    const { data: customers } = await supabase.from('pos_customers')
      .select('id, name, phone')
      .eq('business_id', business_id)
      .in('id', customerIds);

    let sent = 0; let errors = 0;
    for (const c of customers ?? []) {
      if (!c.phone) continue;

      const result = await sendSMS(c.phone, message, { category: 'marketing', businessId: business_id, customerId: c.id });
      const smsOk = result.ok;
      if (smsOk) sent++; else errors++;

      await supabase.from('campaigns').insert({
        business_id,
        customer_id: c.id,
        type: 'winback',
        message,
        sms_sent: smsOk,
        status: smsOk ? 'sent' : 'failed',
        twilio_sid: result.message_id ?? null,
        error: result.error ?? null,
        sent_at: smsOk ? new Date().toISOString() : null,
        failed_at: !smsOk ? new Date().toISOString() : null,
      }).then(() => null, () => null);
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

  const { data: customer } = await supabase.from('pos_customers').select('*').eq('id', customerId).eq('business_id', business_id).single();
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  if (!customer.phone) return NextResponse.json({ error: 'No phone number', sms_sent: false, code: 'NO_PHONE' }, { status: 400 });

  const daysSince = customer.last_visit ? Math.floor((Date.now() - new Date(customer.last_visit).getTime()) / 86400000) : null;
  let messageText = body.message ?? '';
  if (!messageText) {
    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const response = 
await trackAICall({ route: 'aria/winback', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'winback-sms-draft' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929', max_tokens: 200,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      temperature: 0.75,
      system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: `Write a short, friendly winback SMS (max 160 chars) for customer: ${customer.name}, business: ${business.name} (${business.industry}), days since last visit: ${daysSince ?? 'unknown'}. Include a personalised offer.` }],
    }));
    messageText = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  }

  const result = await sendSMS(customer.phone, messageText, { category: 'marketing', businessId: business_id, customerId });

  await supabase.from('campaigns').insert({
    business_id, customer_id: customerId, type: 'winback', message: messageText,
    sms_sent: result.ok, twilio_sid: result.message_id ?? null, error: result.error ?? null,
    sent_at: result.ok ? new Date().toISOString() : null,
    failed_at: !result.ok ? new Date().toISOString() : null,
    status: result.ok ? 'sent' : 'failed',
  }).then(() => null, () => null);

  await supabase.from('activity_log').insert({
    business_id, action_type: 'winback',
    description: result.ok ? `Winback SMS sent to ${customer.name}` : `Winback SMS to ${customer.name} FAILED`,
  }).then(() => null, () => null);

  if (!result.ok) {
    Sentry.captureException(new Error(`SMS delivery failed: ${result.error}`), {
      tags: { route: 'aria/winback' },
      extra: { business_id, customer_id: customerId },
    });
    return NextResponse.json({ error: 'SMS delivery failed', message: result.error, sms_sent: false }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: messageText, sms_sent: true, sid: result.message_id });
}

export const POST = withErrorCapture('aria/winback', _POST)
