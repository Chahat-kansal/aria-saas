export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface CustRow { id: string; total_lifetime_spend: number | null; total_spent: number | null; points_balance: number | null; loyalty_points: number | null; last_visit_at: string | null; loyalty_tier: string | null }

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

  const { data: customers } = await supabase.from('pos_customers')
    .select('id, total_lifetime_spend, total_spent, points_balance, loyalty_points, last_visit_at, loyalty_tier')
    .eq('business_id', bid).limit(2000);

  const rows = (customers ?? []) as CustRow[];
  const spendOf = (c: CustRow) => Number(c.total_lifetime_spend ?? c.total_spent ?? 0);
  const pointsOf = (c: CustRow) => Number(c.points_balance ?? c.loyalty_points ?? 0);
  const loyalty = rows.filter(c => pointsOf(c) > 0);
  const nonLoyalty = rows.filter(c => pointsOf(c) === 0);
  const avg = (arr: CustRow[]) => arr.length > 0 ? arr.reduce((s, c) => s + spendOf(c), 0) / arr.length : 0;
  const loyaltyAvg = avg(loyalty);
  const nonLoyaltyAvg = avg(nonLoyalty);
  const multiplier = nonLoyaltyAvg > 0 ? loyaltyAvg / nonLoyaltyAvg : 0;

  // At-risk by tier — no visit in 45 days
  const cutoff = Date.now() - 45 * 86400_000;
  const atRisk: Record<string, { count: number; annual_revenue_at_risk: number }> = {};
  for (const c of loyalty) {
    if (!c.last_visit_at) continue;
    if (new Date(c.last_visit_at).getTime() > cutoff) continue;
    const tier = (c.loyalty_tier ?? 'unranked').toLowerCase();
    if (!atRisk[tier]) atRisk[tier] = { count: 0, annual_revenue_at_risk: 0 };
    atRisk[tier].count++;
    // Naive annualised spend estimate
    atRisk[tier].annual_revenue_at_risk += spendOf(c) * 0.5;
  }

  const summary = {
    loyalty_members: loyalty.length,
    non_loyalty: nonLoyalty.length,
    avg_loyalty_spend: Math.round(loyaltyAvg * 100) / 100,
    avg_non_loyalty_spend: Math.round(nonLoyaltyAvg * 100) / 100,
    spend_multiplier: Math.round(multiplier * 10) / 10,
    at_risk: atRisk,
  };

  let insight = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: 0.3,
      system: 'You are a loyalty program analyst for an Australian small business. Plain prose, 3-4 sentences, specific numbers from the data. No preamble, no lists.',
      messages: [{ role: 'user', content: `Loyalty stats:\n${JSON.stringify(summary)}\n\nIf 20 new loyalty members join this month at the same loyalty average spend, what additional monthly revenue does that imply? Give a forecast, then call out the biggest at-risk segment and the annual revenue at stake.` }],
    });
    insight = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    success = true;
  } catch (e) { console.error('[revenue-forecast] AI failed:', (e as Error).message); }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'loyalty_revenue_forecast', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'forecast',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({ summary, insight });
}

export const POST = withErrorCapture('loyalty/revenue-forecast', _POST);
