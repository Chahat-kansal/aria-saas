export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface CacheRow { brief: string; generated_at: string }

const _cache = new Map<string, CacheRow>();

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const business_id = new URL(req.url).searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // 24h in-memory cache
  const cached = _cache.get(business_id);
  if (cached && Date.now() - new Date(cached.generated_at).getTime() < 24 * 3600_000) {
    return NextResponse.json({ brief: cached.brief, cached: true, generated_at: cached.generated_at });
  }

  const yesterday = new Date(Date.now() - 86400_000).toISOString();
  const { data: snaps } = await supabase.from('competitor_snapshots')
    .select('competitor_name, rating, review_count, price_index, snapshot_date')
    .eq('business_id', business_id)
    .gte('created_at', yesterday)
    .order('created_at', { ascending: false });

  const { data: alerts } = await supabase.from('aria_competitor_alerts')
    .select('competitor_name, alert_type, message, created_at')
    .eq('business_id', business_id)
    .gte('created_at', yesterday)
    .limit(10);

  if ((snaps ?? []).length === 0 && (alerts ?? []).length === 0) {
    return NextResponse.json({ brief: 'No competitor activity recorded yet — Aria will start monitoring tomorrow.', cached: false });
  }

  let brief = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      temperature: 0.3,
      system: 'You are a local Australian small business competitive analyst. Write a 2-3 sentence morning brief about yesterday\'s competitor landscape. Plain prose, specific numbers, no preamble.',
      messages: [{ role: 'user', content: `Snapshots:\n${JSON.stringify(snaps ?? [])}\n\nAlerts:\n${JSON.stringify(alerts ?? [])}\n\nWrite the brief now.` }],
    });
    brief = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    success = true;
  } catch (e) { console.error('[competitive-brief] AI failed:', (e as Error).message); }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id, agent_key: 'competitive_brief', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'briefing',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch (e) { console.error('[non-fatal]', e) }
  })());

  const generated_at = new Date().toISOString();
  if (brief) _cache.set(business_id, { brief, generated_at });
  return NextResponse.json({ brief, cached: false, generated_at });
}

export const GET = withErrorCapture('aria/competitive-brief', _GET);
