export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseLLMJsonOr } from '@/lib/ai-json';
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'
import { guardOutput } from '@/lib/aria/ground-guard'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, context } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, name, industry, city').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // FAB-FIX-2 — real menu prices are the ONLY dollar figures the promo may reference. The discount % is the
  // owner's chosen offer (not a data fact), so percentages are left alone; any $ price is guarded.
  const { data: priceRows } = await supabase.from('pos_products')
    .select('name, price').eq('business_id', business_id).eq('is_active', true).order('price', { ascending: false }).limit(40);
  const realPrices = (priceRows ?? []).map(p => Number(p.price)).filter(n => Number.isFinite(n) && n > 0);
  const menu = (priceRows ?? []).slice(0, 20).map(p => `${p.name} A$${Number(p.price).toFixed(2)}`).join(', ');

  // Strip any ungrounded $ from a customer-facing line, preferring no price over a fabricated one.
  const guardField = async (s: string | undefined, surface: string): Promise<string> => {
    const g = await guardOutput(s ?? '', realPrices, { mode: 'redact', ignorePercent: true, businessId: business_id, surface });
    return g.text;
  };

  try {
    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg = 
await trackAICall({ route: 'aria/generate-promotion', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'slow-day-promotion' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      temperature: 0.75,
      system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
      messages: [{
        role: 'user',
        content: `Create a targeted promotion for ${biz.name} (${biz.industry} in ${biz.city ?? 'Australia'}).

Context: ${JSON.stringify(context ?? {})}
${menu ? `Real menu prices (the ONLY dollar prices you may reference — never invent a price): ${menu}` : 'No menu prices on file — do NOT state any specific dollar price.'}

Return JSON:
{
  "promotion_name": "catchy name",
  "offer_text": "specific offer text (e.g. '20% off all beverages')",
  "sms_message": "SMS under 160 chars with offer",
  "recommended_time_to_send": "e.g. Tuesday morning 8am",
  "rationale": "one sentence why this will work"
}`,
      }],
    }));

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const promo = parseLLMJsonOr(raw, null, 'generate-promotion') as Record<string, string> | null;
    if (!promo) throw new Error('No JSON');
    // Guard the two customer-facing fields against real prices before persisting/returning.
    promo.offer_text = await guardField(promo.offer_text, 'generate-promotion:offer');
    promo.sms_message = await guardField(promo.sms_message, 'generate-promotion:sms');
    try { await supabaseAdmin.from('aria_promotions').insert({ business_id, promotion_name: promo.promotion_name, offer_text: promo.offer_text, sms_message: promo.sms_message, target_day: context?.slowest_day ?? null, status: 'generated' }) } catch (e) { console.error('[non-fatal]', e) }
    return NextResponse.json(promo);
  } catch {
    const fallback = {
      promotion_name: 'Slow Day Special',
      offer_text: '15% off all items',
      sms_message: `Hi! Enjoy 15% off at ${biz.name} this week. Show this SMS at the counter. Limited time only! 😊`,
      recommended_time_to_send: 'Monday morning 8am',
      rationale: 'Incentivise visits on your slowest day with a compelling discount.',
    };
    try { await supabaseAdmin.from('aria_promotions').insert({ business_id, promotion_name: fallback.promotion_name, offer_text: fallback.offer_text, sms_message: fallback.sms_message, target_day: context?.slowest_day ?? null, status: 'generated' }) } catch (e) { console.error('[non-fatal]', e) }
    return NextResponse.json(fallback);
  }
}

export const POST = withErrorCapture('aria/generate-promotion', _POST)
