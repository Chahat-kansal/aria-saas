export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, context } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, name, industry, city').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `${ARIA_VOICE}

You are a marketing expert for Australian small businesses. Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Create a targeted promotion for ${biz.name} (${biz.industry} in ${biz.city ?? 'Australia'}).

Context: ${JSON.stringify(context ?? {})}

Return JSON:
{
  "promotion_name": "catchy name",
  "offer_text": "specific offer text (e.g. '20% off all beverages')",
  "sms_message": "SMS under 160 chars with offer",
  "recommended_time_to_send": "e.g. Tuesday morning 8am",
  "rationale": "one sentence why this will work"
}`,
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    const promo = match ? JSON.parse(match[0]) : null;
    if (!promo) throw new Error('No JSON');
    return NextResponse.json(promo);
  } catch {
    return NextResponse.json({
      promotion_name: 'Slow Day Special',
      offer_text: '15% off all items',
      sms_message: `Hi! Enjoy 15% off at ${biz.name} this week. Show this SMS at the counter. Limited time only! 😊`,
      recommended_time_to_send: 'Monday morning 8am',
      rationale: 'Incentivise visits on your slowest day with a compelling discount.',
    });
  }
}
