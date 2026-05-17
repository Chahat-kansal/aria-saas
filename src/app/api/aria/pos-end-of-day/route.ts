export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, session_id } = await req.json();
  if (!business_id || !session_id) {
    return NextResponse.json({ error: 'business_id and session_id required' }, { status: 400 });
  }

  // Verify business ownership
  const bid = await getBid(supabase, user.id);
  if (!bid || bid !== business_id) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  // Fetch session
  const { data: session, error: sessionError } = await supabase
    .from('pos_cash_sessions')
    .select('*')
    .eq('id', session_id)
    .eq('business_id', business_id)
    .single();

  if (sessionError || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Fetch business name
  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', business_id)
    .single();

  // Fetch today's completed sales for this session
  const { data: sales } = await supabase
    .from('pos_sales')
    .select('id, total_amount, created_at')
    .eq('session_id', session_id)
    .eq('status', 'completed');

  const todaySales = sales ?? [];
  const todayRevenue = todaySales.reduce((sum, s) => sum + (s.total_amount as number ?? 0), 0);
  const todayCount = todaySales.length;
  const avgBasket = todayCount > 0 ? todayRevenue / todayCount : 0;

  // Compute busiest hour
  const hourCounts: Record<number, number> = {};
  for (const s of todaySales) {
    const hour = new Date(s.created_at as string).getHours();
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
  }
  const busiestHour = Object.keys(hourCounts).length > 0
    ? parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0])
    : null;

  // Fetch top 5 products by revenue for this session
  let topProduct: string | null = null;
  if (todaySales.length > 0) {
    const saleIds = todaySales.map((s) => s.id as string);
    const { data: items } = await supabase
      .from('pos_sale_items')
      .select('product_name, quantity, line_total')
      .in('sale_id', saleIds);

    if (items && items.length > 0) {
      const productMap: Record<string, { qty: number; revenue: number }> = {};
      for (const item of items) {
        const name = item.product_name as string ?? 'Unknown';
        if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
        productMap[name].qty += item.quantity as number ?? 0;
        productMap[name].revenue += item.line_total as number ?? 0;
      }
      const sorted = Object.entries(productMap).sort((a, b) => b[1].revenue - a[1].revenue);
      if (sorted.length > 0) topProduct = sorted[0][0];
    }
  }

  // Fetch 7-day average (exclude today)
  const today = new Date().toISOString().split('T')[0];
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const { data: historicSales } = await supabase
    .from('pos_sales')
    .select('total_amount, created_at')
    .eq('business_id', business_id)
    .eq('status', 'completed')
    .gte('created_at', eightDaysAgo)
    .lt('created_at', `${today}T00:00:00.000Z`);

  let sevenDayAvg = 0;
  if (historicSales && historicSales.length > 0) {
    const dailyMap: Record<string, number> = {};
    for (const s of historicSales) {
      const day = (s.created_at as string).split('T')[0];
      dailyMap[day] = (dailyMap[day] ?? 0) + (s.total_amount as number ?? 0);
    }
    const days = Object.values(dailyMap);
    if (days.length > 0) sevenDayAvg = days.reduce((a, b) => a + b, 0) / days.length;
  }

  const vsAvgPct = sevenDayAvg > 0 ? Math.round(((todayRevenue - sevenDayAvg) / sevenDayAvg) * 100) : null;

  const stats = {
    today_revenue: Math.round(todayRevenue * 100) / 100,
    today_count: todayCount,
    avg_basket: Math.round(avgBasket * 100) / 100,
    top_product: topProduct,
    vs_avg_pct: vsAvgPct,
  };

  let debrief: string | null = null;
  try {
    const prompt = `Analyse today's trading for ${business?.name ?? 'the business'} and give a 3-sentence debrief for the owner closing up. Include: how today compared to 7-day average (today: A$${stats.today_revenue}, avg: A$${Math.round(sevenDayAvg * 100) / 100}, ${vsAvgPct !== null ? `${vsAvgPct > 0 ? '+' : ''}${vsAvgPct}%` : 'no comparison data'}), best-selling product (${topProduct ?? 'unknown'}), one actionable recommendation for tomorrow. Be warm and conversational.`;

    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const response = 
await trackAICall({ route: 'aria/pos-end-of-day', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'pos-eod-summary' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }));

    debrief = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
  } catch {
    // AI failure — still return stats
    debrief = null;
  }

  return NextResponse.json({ debrief, stats });
}

export const POST = withErrorCapture('aria/pos-end-of-day', _POST)
