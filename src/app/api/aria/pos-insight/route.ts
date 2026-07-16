export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'
import { todayAEST, addDaysYmd, toAESTStart } from '@/lib/date-au'

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

  // INTEL-COMPUTE-4 — today/yesterday/lastWeekSameDay were UTC calendar dates, so the "today" window
  // was off by AEST's whole UTC offset (a 9am AEST sale is still "yesterday" in UTC). The nested
  // pos_sales id lookup for topProductRes also had no status filter, letting voided/refunded/draft
  // sale_ids leak into "top product today".
  const today = todayAEST();
  const yesterday = addDaysYmd(today, -1);
  const lastWeekSameDay = addDaysYmd(today, -7);
  const sixDaysAgo = addDaysYmd(today, -6);

  const todayStart = toAESTStart(today);
  const yesterdayStart = toAESTStart(yesterday);
  const lastWeekStart = toAESTStart(lastWeekSameDay);
  const sixDaysAgoStart = toAESTStart(sixDaysAgo);

  const [todayRes, yesterdayRes, lastWeekRes, topProductRes] = await Promise.all([
    supabase.from('pos_sales').select('total_amount').eq('business_id', business_id).eq('status', 'completed').gte('created_at', todayStart),
    supabase.from('pos_sales').select('total_amount').eq('business_id', business_id).eq('status', 'completed').gte('created_at', yesterdayStart).lt('created_at', todayStart),
    supabase.from('pos_sales').select('total_amount').eq('business_id', business_id).eq('status', 'completed').gte('created_at', lastWeekStart).lt('created_at', sixDaysAgoStart),
    supabase.from('pos_sale_items').select('product_name, quantity').gte('created_at', todayStart).in('sale_id', (await supabase.from('pos_sales').select('id').eq('business_id', business_id).eq('status', 'completed').gte('created_at', todayStart)).data?.map((s: any) => s.id) ?? []),
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
    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg = 
await trackAICall({ route: 'aria/pos-insight', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'pos-insight' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
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
