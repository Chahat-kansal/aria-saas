export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface SessionRow { variance_cents: number | null; closed_at: string | null; closed_by: string | null; total_cash_sales: number | null; total_card_sales: number | null }

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
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const since = new Date(Date.now() - 21 * 86400_000).toISOString();
  const { data } = await supabase.from('pos_cash_sessions')
    .select('variance_cents, closed_at, closed_by, total_cash_sales, total_card_sales')
    .eq('business_id', bid)
    .eq('status', 'closed')
    .gte('closed_at', since)
    .order('closed_at', { ascending: true });

  const sessions = (data ?? []) as SessionRow[];

  // Bucket by week
  const weekly: Record<string, { variance: number; revenue: number; count: number }> = {};
  for (const s of sessions) {
    if (!s.closed_at) continue;
    const d = new Date(s.closed_at);
    const monday = new Date(d);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const wk = monday.toISOString().slice(0, 10);
    if (!weekly[wk]) weekly[wk] = { variance: 0, revenue: 0, count: 0 };
    weekly[wk].variance += Math.abs(Number(s.variance_cents ?? 0));
    weekly[wk].revenue += Number(s.total_cash_sales ?? 0) + Number(s.total_card_sales ?? 0);
    weekly[wk].count++;
  }
  const weeks = Object.entries(weekly).sort();
  const ratios = weeks.map(([wk, v]) => ({ week: wk, ratio: v.revenue > 0 ? (v.variance / 100) / v.revenue * 100 : 0 }));

  // Pattern detection: are last 3 weeks all >2%?
  const last3 = ratios.slice(-3);
  const patternDetected = last3.length === 3 && last3.every(r => r.ratio > 2);

  let analysis = '';
  let inputTokens = 0, outputTokens = 0, success = false;

  if (patternDetected) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        temperature: 0.3,
        system: 'You are a retail loss-prevention analyst for Australian small businesses. Plain prose, max 3 short sentences. Identify the most likely pattern (time of day, day of week, or staff member) and recommend one specific action. No preamble.',
        messages: [{ role: 'user', content: `Cash variance over last 21 days (variance % of revenue per week):\n${JSON.stringify(last3)}\n\nClosed sessions (variance cents, closed_at, closed_by):\n${JSON.stringify(sessions.slice(-30))}` }],
      });
      analysis = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      success = true;
    } catch (e) { console.error('[theft-detection] AI failed:', (e as Error).message); }
  }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'theft_detection', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'loss_prevention',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({ pattern_detected: patternDetected, weekly: ratios, analysis });
}

export const POST = withErrorCapture('aria/theft-detection', _POST);
