export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id, name').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const business_id = body.business_id ?? await getBid(supabase, user.id);
  if (!business_id) return NextResponse.json({ insight: null });

  const { data: biz } = await supabase.from('businesses').select('name').eq('id', business_id).single();

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const lastWeekSameDay = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const [todayRes, yesterdayRes, lastWeekRes, topProductRes] = await Promise.all([
    supabase.from('pos_sales').select('total_amount').eq('business_id', business_id).eq('status', 'completed').gte('created_at', `${today}T00:00:00`),
    supabase.from('pos_sales').select('total_amount').eq('business_id', business_id).eq('status', 'completed').gte('created_at', `${yesterday}T00:00:00`).lt('created_at', `${today}T00:00:00`),
    supabase.from('pos_sales').select('total_amount').eq('business_id', business_id).eq('status', 'completed').gte('created_at', `${lastWeekSameDay}T00:00:00`).lt('created_at', `${new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]}T00:00:00`),
    supabase.from('pos_sale_items').select('product_name, quantity').gte('created_at', `${today}T00:00:00`).in('sale_id', (await supabase.from('pos_sales').select('id').eq('business_id', business_id).gte('created_at', `${today}T00:00:00`)).data?.map((s: any) => s.id) ?? []),
  ]);

  const todayRev = (todayRes.data ?? []).reduce((s, x) => s + (x.total_amount ?? 0), 0);
  const todayTx = (todayRes.data ?? []).length;
  const yesterdayRev = (yesterdayRes.data ?? []).reduce((s, x) => s + (x.total_amount ?? 0), 0);
  const lastWeekRev = (lastWeekRes.data ?? []).reduce((s, x) => s + (x.total_amount ?? 0), 0);
  const avgBasket = todayTx > 0 ? todayRev / todayTx : 0;

  // Top product today
  const productTotals: Record<string, number> = {};
  for (const item of topProductRes.data ?? []) {
    productTotals[item.product_name ?? 'Unknown'] = (productTotals[item.product_name ?? 'Unknown'] ?? 0) + (item.quantity ?? 1);
  }
  const topProduct = Object.entries(productTotals).sort((a, b) => b[1] - a[1])[0];

  if (todayTx === 0) return NextResponse.json({ insight: `No sales yet today at ${biz?.name ?? 'your store'}. Open the register and start selling!`, cached: false });

  try {
    const msg = await trackAICall({ route: 'aria/pos-insight', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'pos-insight' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Analyse today's sales for ${biz?.name ?? 'this store'}:
Today: A$${todayRev.toFixed(2)} from ${todayTx} sales (avg A$${avgBasket.toFixed(2)})
Yesterday: A$${yesterdayRev.toFixed(2)}
Same day last week: A$${lastWeekRev.toFixed(2)}
${topProduct ? `Top product today: ${topProduct[0]} (${topProduct[1]} sold)` : ''}

Write exactly 2 sentences: one about performance vs recent days, one specific recommendation. Be direct, Australian context, use A$.`,
      }],
    }));
    const insight = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ insight, today_revenue: todayRev, today_transactions: todayTx, avg_basket: avgBasket });
  } catch {
    const pctVsYesterday = yesterdayRev > 0 ? Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100) : null;
    return NextResponse.json({
      insight: `Today: A$${todayRev.toFixed(2)} from ${todayTx} transactions${pctVsYesterday !== null ? ` (${pctVsYesterday > 0 ? '+' : ''}${pctVsYesterday}% vs yesterday)` : ''}.${topProduct ? ` ${topProduct[0]} is your top seller today.` : ''}`,
      today_revenue: todayRev,
      today_transactions: todayTx,
      avg_basket: avgBasket,
    });
  }
}

export const POST = withErrorCapture('aria/pos-insight', _POST)
