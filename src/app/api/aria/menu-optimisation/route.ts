export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface RecipeRow { id: string; name: string; cost_per_serve: number | null; menu_price: number | null; margin_percent: number | null; linked_product_id: string | null; }

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: recipes } = await supabase
    .from('recipes')
    .select('id,name,cost_per_serve,menu_price,margin_percent,linked_product_id')
    .eq('business_id', business_id);

  const list = (recipes ?? []) as RecipeRow[];

  // Pull sales velocity per product over last 28 days
  const since = new Date(Date.now() - 28 * 86400000).toISOString();
  const { data: sales } = await supabase
    .from('pos_sale_items')
    .select('product_id, quantity, pos_sales!inner(business_id, created_at)')
    .gte('pos_sales.created_at', since);

  const velocity: Record<string, number> = {};
  for (const row of (sales ?? []) as { product_id: string; quantity: number }[]) {
    if (!row.product_id) continue;
    velocity[row.product_id] = (velocity[row.product_id] ?? 0) + Number(row.quantity ?? 0);
  }

  const analysis = list.map(r => {
    const sold = r.linked_product_id ? velocity[r.linked_product_id] ?? 0 : 0;
    const weekly = sold / 4;
    const margin = r.margin_percent ?? 0;
    let quadrant: 'star' | 'gem' | 'workhorse' | 'review';
    if (margin >= 60 && weekly >= 20) quadrant = 'star';
    else if (margin >= 60 && weekly < 20) quadrant = 'gem';
    else if (margin < 60 && weekly >= 20) quadrant = 'workhorse';
    else quadrant = 'review';
    return { id: r.id, name: r.name, margin, weekly_sales: weekly, menu_price: r.menu_price, cost_per_serve: r.cost_per_serve, quadrant };
  });

  let insight = '';
  let inputTokens = 0, outputTokens = 0, aiSuccess = false;

  if (analysis.length > 0) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        temperature: 0.3,
        system: 'You are a cafe menu optimisation analyst. Give 3 specific, actionable recommendations in plain language. No preamble.',
        messages: [{ role: 'user', content: `Recipes with margin% and weekly sales:\n${JSON.stringify(analysis.slice(0, 20))}\n\nGive 3 short actionable recommendations to improve menu profitability.` }],
      });
      insight = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('');
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      aiSuccess = true;
    } catch (e) { console.error('[menu-optimisation] AI failed:', (e as Error).message); }
  }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id, agent_key: 'menu_optimisation', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'menu_insights',
        input_tokens: inputTokens, output_tokens: outputTokens, success: aiSuccess,
      });
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({ analysis, insight });
}

export const POST = withErrorCapture('aria/menu-optimisation', _POST);
