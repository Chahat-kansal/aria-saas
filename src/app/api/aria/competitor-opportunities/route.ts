export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface Review { text: string; rating: number }
interface Opportunity { competitor: string; complaint_theme: string; advantage: string; message: string }

async function fetchReviews(competitorName: string, city: string, key: string): Promise<Review[]> {
  try {
    const q = encodeURIComponent(`${competitorName} ${city} Australia`);
    const find = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id&key=${key}`);
    const findData = await find.json() as { candidates?: Array<{ place_id?: string }> };
    const pid = findData.candidates?.[0]?.place_id;
    if (!pid) return [];
    const det = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${pid}&fields=reviews&key=${key}`);
    const detData = await det.json() as { result?: { reviews?: Array<{ text: string; rating: number }> } };
    return (detData.result?.reviews ?? []).filter(r => r.rating <= 2).slice(0, 5);
  } catch { return []; }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses')
    .select('name, suburb, city, industry').eq('id', business_id).maybeSingle();
  const city = (biz?.suburb as string | null) ?? (biz?.city as string | null) ?? 'Melbourne';

  const { data: watches } = await supabase.from('aria_competitor_watches')
    .select('competitor_name').eq('business_id', business_id).eq('is_active', true).limit(5);

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ opportunities: [], no_api_key: true });

  const allReviews: { competitor: string; reviews: Review[] }[] = [];
  for (const w of watches ?? []) {
    const reviews = await fetchReviews(w.competitor_name as string, city, key);
    if (reviews.length > 0) allReviews.push({ competitor: w.competitor_name as string, reviews });
  }

  if (allReviews.length === 0) return NextResponse.json({ opportunities: [] });

  let opportunities: Opportunity[] = [];
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      temperature: 0.3,
      system: 'You are a competitive marketing strategist for an Australian small business. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: `Business: ${biz?.name ?? 'the business'} (${biz?.industry ?? 'retail'}, ${city})\n\nCompetitor 1-2 star reviews:\n${JSON.stringify(allReviews)}\n\nFor each competitor, extract the main complaint theme and suggest a specific message ${biz?.name ?? 'the business'} can use to win those customers. Return:\n{"opportunities":[{"competitor":"...","complaint_theme":"...","advantage":"...","message":"..."}]}\nMax 3 opportunities. No preamble.` }],
    });
    const text = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('');
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s >= 0 && e > s) {
      const parsed = JSON.parse(clean.slice(s, e + 1));
      if (Array.isArray(parsed.opportunities)) { opportunities = parsed.opportunities; success = true; }
    }
  } catch (e) { console.error('[competitor-opportunities] AI failed:', (e as Error).message); }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id, agent_key: 'competitor_opportunities', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'opportunities',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({ opportunities });
}

export const POST = withErrorCapture('aria/competitor-opportunities', _POST);
