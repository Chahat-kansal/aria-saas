export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface ItemRow { product_name: string | null; quantity: number | null }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ suggestion: 'Try a quick 10% off coupon shared on social.' });

  // Pick slow-moving items as candidates (low recent sales but in stock)
  const sevenAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: items } = await supabase.from('pos_sale_items')
    .select('product_name, quantity, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', bid).gte('pos_sales.created_at', sevenAgo).limit(2000);
  const counts: Record<string, number> = {};
  for (const r of (items ?? []) as unknown as ItemRow[]) {
    const n = r.product_name ?? 'unknown';
    counts[n] = (counts[n] ?? 0) + Number(r.quantity ?? 0);
  }
  const sorted = Object.entries(counts).sort((a, b) => a[1] - b[1]);
  const slow = sorted.slice(0, 5).map(([n]) => n);

  let suggestion = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 120, temperature: 0.7,
      system: 'You are a small-business marketing tactician. Give ONE concrete flash-promo idea in one short sentence. No preamble.',
      messages: [{ role: 'user', content: `Quiet 30-min stretch. Slow movers this week: ${JSON.stringify(slow)}. Suggest one promo we can run right now to attract walk-ins.` }],
    });
    suggestion = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    inputTokens = res.usage.input_tokens; outputTokens = res.usage.output_tokens; success = true;
  } catch (e) { console.error('[quick-promo] AI failed:', (e as Error).message); }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'quick_promo', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'flash_promo',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch (e) { console.error('[non-fatal]', e) }
  })());

  return NextResponse.json({ suggestion: suggestion || 'Try 20% off your slowest seller for the next 30 minutes.' });
}

export const POST = withErrorCapture('pos/quick-promo-suggest', _POST);
