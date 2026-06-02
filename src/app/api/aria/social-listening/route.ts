export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface Mention { text: string; source: string; sentiment: 'positive' | 'negative' | 'neutral' }

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, mentions } = await req.json() as { business_id: string; mentions?: string[] };
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses')
    .select('name, suburb, city').eq('id', business_id).maybeSingle();
  const name = biz?.name as string ?? 'the business';

  // If caller didn't supply mentions, return a stub set (real impl wires to Tavily search)
  const corpus = Array.isArray(mentions) && mentions.length > 0 ? mentions : [];

  if (corpus.length === 0) {
    return NextResponse.json({ mentions: [], summary: `No new social mentions detected for ${name}.`, negative_spike: false });
  }

  let tagged: Mention[] = [];
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0,
      system: 'You tag brand mentions with sentiment. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: `Brand: "${name}"\nMentions:\n${JSON.stringify(corpus)}\n\nFor each, classify sentiment as positive | negative | neutral. Return:\n{"mentions":[{"text":"...","source":"...","sentiment":"..."}]}` }],
    });
    const text = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('');
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s >= 0 && e > s) {
      const parsed = JSON.parse(clean.slice(s, e + 1));
      if (Array.isArray(parsed.mentions)) { tagged = parsed.mentions; success = true; }
    }
  } catch (e) { console.error('[social-listening] AI failed:', (e as Error).message); }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id, agent_key: 'social_listening', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'sentiment',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })());

  const negCount = tagged.filter(m => m.sentiment === 'negative').length;
  return NextResponse.json({
    mentions: tagged,
    summary: `${tagged.length} mentions · ${tagged.filter(m => m.sentiment === 'positive').length} positive · ${negCount} negative`,
    negative_spike: negCount > 3,
  });
}

export const POST = withErrorCapture('aria/social-listening', _POST);
