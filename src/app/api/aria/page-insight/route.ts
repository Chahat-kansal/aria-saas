export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string
): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

type Priority = 'info' | 'warning' | 'critical';

interface PageInsightResult {
  insight: string | null;
  priority?: Priority;
  link?: string;
}

async function callClaude(prompt: string, systemPrompt?: string): Promise<string> {
  const sys = systemPrompt ?? 'You are Aria, an AI business co-owner. Be specific and concise.'
  const msg = await trackAICall(
    { route: 'aria/page-insight', model: 'claude-sonnet-4-6', businessId: undefined, purpose: 'page-insight' },
    () => anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 80,
      temperature: 0.4,
      system: [{ type: 'text' as const, text: sys, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: prompt }],
    })
  )
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}

async function _POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[page-insight] ANTHROPIC_API_KEY is not set')
    return NextResponse.json({ insight: null }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { business_id?: string; page?: string; page_data?: object };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ insight: null });
  }

  const business_id = body.business_id ?? (await getBid(supabase, user.id));
  if (!business_id) return NextResponse.json({ insight: null });

  // Ownership check
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ insight: null });

  const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)

  const page = (body.page ?? '').toLowerCase().trim();
  const bizName = (biz as { id: string; name: string }).name ?? 'your business';

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const today = now.toISOString().split('T')[0];

    if (page === 'stock' || page === 'warehouse/stock') {
      const { data: products } = await supabase
        .from('pos_products')
        .select('id, name, stock_quantity, low_stock_threshold')
        .eq('business_id', business_id)
        .eq('track_stock', true);

      const below = (products ?? []).filter(
        (p: { stock_quantity: number | null; low_stock_threshold: number | null }) =>
          (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 0)
      );
      const outOfStock = below.filter(
        (p: { stock_quantity: number | null }) => (p.stock_quantity ?? 0) <= 0
      );
      const context = `${below.length} products below threshold, ${outOfStock.length} out of stock. Items: ${below
        .slice(0, 5)
        .map(
          (p: { name: string; stock_quantity: number | null; low_stock_threshold: number | null }) =>
            `${p.name} (${p.stock_quantity ?? 0} left, threshold ${p.low_stock_threshold ?? 0})`
        )
        .join(', ')}`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about stock for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      const priority: Priority =
        outOfStock.length > 0 ? 'critical' : below.length > 0 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/reorder' } satisfies PageInsightResult);
    }

    if (page === 'winback') {
      const { data: lapsed } = await supabase
        .from('pos_customers')
        .select('id, name, last_visit')
        .eq('business_id', business_id)
        .lt('last_visit', sixtyDaysAgo);

      const count = (lapsed ?? []).length;
      const context = `${count} customers have not visited in over 60 days.`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about winback for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      const priority: Priority = count > 20 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/winback' } satisfies PageInsightResult);
    }

    if (page === 'reviews') {
      const { data: unanswered } = await supabase
        .from('reviews')
        .select('id, rating')
        .eq('business_id', business_id)
        .is('response', null);

      const count = (unanswered ?? []).length;
      const ratings = (unanswered ?? []).map(
        (r: { rating: number | null }) => r.rating ?? 0
      );
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
          : 0;

      const context = `${count} unanswered reviews. Average rating of unanswered: ${avgRating.toFixed(1)}.`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about reviews for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      const priority: Priority = count > 5 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/reviews' } satisfies PageInsightResult);
    }

    if (page === 'staff') {
      const { data: staff } = await supabase
        .from('staff_members')
        .select('id, name, visa_expiry_date')
        .eq('business_id', business_id)
        .lte('visa_expiry_date', thirtyDaysFromNow)
        .gte('visa_expiry_date', today);

      const count = (staff ?? []).length;
      const context = `${count} staff members have visa expiring within 30 days. Names: ${(staff ?? [])
        .slice(0, 3)
        .map(
          (s: { name: string; visa_expiry_date: string | null }) =>
            `${s.name} (expires ${s.visa_expiry_date ?? 'unknown'})`
        )
        .join(', ')}`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about staff compliance for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      const priority: Priority = count > 0 ? 'critical' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/staff' } satisfies PageInsightResult);
    }

    if (page === 'variance') {
      const [movementsRes, salesRes] = await Promise.all([
        supabase
          .from('stock_movements')
          .select('quantity, movement_type, cost_price')
          .eq('business_id', business_id)
          .gte('created_at', `${thirtyDaysAgo}T00:00:00`),
        supabase
          .from('pos_sales')
          .select('total_amount')
          .eq('business_id', business_id)
          .eq('status', 'completed')
          .gte('created_at', `${thirtyDaysAgo}T00:00:00`),
      ]);

      const movements = movementsRes.data ?? [];
      const sales = salesRes.data ?? [];
      const totalSales = sales.reduce(
        (s: number, x: { total_amount: number | null }) => s + (x.total_amount ?? 0),
        0
      );
      const adjustments = movements.filter(
        (m: { movement_type: string }) => m.movement_type === 'adjustment'
      );
      const varianceValue = adjustments.reduce(
        (s: number, m: { quantity: number | null; cost_price: number | null }) =>
          s + Math.abs((m.quantity ?? 0) * (m.cost_price ?? 0)),
        0
      );

      const context = `Last 30 days: A$${totalSales.toFixed(2)} in sales, ${adjustments.length} stock adjustments worth ~A$${varianceValue.toFixed(2)} in variance.`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about variance for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      const priority: Priority = varianceValue > 500 ? 'critical' : varianceValue > 100 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/variance' } satisfies PageInsightResult);
    }

    if (page === 'profit-leaks' || page === 'profit_leaks') {
      const { data: discountedItems } = await supabase
        .from('pos_sale_items')
        .select('product_name, discount_percent, unit_price, quantity')
        .eq('business_id', business_id)
        .gt('discount_percent', 0)
        .gte('created_at', `${thirtyDaysAgo}T00:00:00`);

      const items = discountedItems ?? [];
      const totalDiscountValue = items.reduce(
        (
          s: number,
          i: {
            discount_percent: number | null;
            unit_price: number | null;
            quantity: number | null;
          }
        ) =>
          s +
          ((i.discount_percent ?? 0) / 100) *
            (i.unit_price ?? 0) *
            (i.quantity ?? 1),
        0
      );

      const byProduct: Record<string, number> = {};
      for (const item of items) {
        const name = (item as { product_name: string | null }).product_name ?? 'Unknown';
        byProduct[name] =
          (byProduct[name] ?? 0) +
          (((item as { discount_percent: number | null }).discount_percent ?? 0) / 100) *
            ((item as { unit_price: number | null }).unit_price ?? 0) *
            ((item as { quantity: number | null }).quantity ?? 1);
      }
      const topLeak = Object.entries(byProduct).sort((a, b) => b[1] - a[1])[0];

      const context = `${items.length} discounted line items in last 30 days, total discount value A$${totalDiscountValue.toFixed(2)}. Biggest leak: ${topLeak ? `${topLeak[0]} (A$${topLeak[1].toFixed(2)})` : 'none identified'}.`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about profit leaks for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      const priority: Priority = totalDiscountValue > 500 ? 'critical' : totalDiscountValue > 100 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/profit-leaks' } satisfies PageInsightResult);
    }

    if (page === 'reorder') {
      const { data: reorderItems } = await supabase
        .from('pos_products')
        .select('id, name, stock_quantity, low_stock_threshold')
        .eq('business_id', business_id)
        .eq('track_stock', true);

      const belowReorder = (reorderItems ?? []).filter(
        (p: { stock_quantity: number | null; low_stock_threshold: number | null }) =>
          (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 0)
      );

      const context = `${belowReorder.length} products below reorder point. Most critical: ${belowReorder
        .slice(0, 3)
        .map(
          (p: {
            name: string;
            stock_quantity: number | null;
            low_stock_threshold: number | null;
          }) => `${p.name} (${p.stock_quantity ?? 0} left)`
        )
        .join(', ')}`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about reorder for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      const outOfStock = belowReorder.filter(
        (p: { stock_quantity: number | null }) => (p.stock_quantity ?? 0) <= 0
      );
      const priority: Priority =
        outOfStock.length > 0 ? 'critical' : belowReorder.length > 0 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/reorder' } satisfies PageInsightResult);
    }

    if (page === 'pos/terminal') {
      const { data: sales } = await supabase
        .from('pos_sales')
        .select('created_at, total_amount')
        .eq('business_id', business_id)
        .eq('status', 'completed')
        .gte('created_at', `${thirtyDaysAgo}T00:00:00`);

      const byHour: Record<number, number> = {};
      for (const sale of sales ?? []) {
        const hour = new Date(
          (sale as { created_at: string }).created_at
        ).getHours();
        byHour[hour] = (byHour[hour] ?? 0) + 1;
      }

      const currentHour = now.getHours();
      const upcomingHours = [1, 2, 3].map((offset) => (currentHour + offset) % 24);
      const upcomingBusy = upcomingHours
        .map((h) => ({ hour: h, count: byHour[h] ?? 0 }))
        .sort((a, b) => b.count - a.count)[0];

      const context = `Upcoming busy hour: ${upcomingBusy?.hour ?? 'unknown'}:00 with avg ${upcomingBusy?.count ?? 0} transactions (based on last 30 days).`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about pos/terminal for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      return NextResponse.json({
        insight,
        priority: 'info' as Priority,
        link: '/pos/terminal',
      } satisfies PageInsightResult);
    }

    if (page === 'dashboard') {
      const [salesRes, productsRes] = await Promise.all([
        supabase
          .from('pos_sales')
          .select('total_amount')
          .eq('business_id', business_id)
          .eq('status', 'completed')
          .gte('created_at', `${today}T00:00:00`),
        supabase
          .from('pos_products')
          .select('id')
          .eq('business_id', business_id)
          .eq('track_stock', true)
          .lte('stock_quantity', 0),
      ]);

      const todayRevenue = (salesRes.data ?? []).reduce(
        (s: number, x: { total_amount: number | null }) => s + (x.total_amount ?? 0),
        0
      );
      const todayTx = (salesRes.data ?? []).length;
      const outOfStockCount = (productsRes.data ?? []).length;

      const context = `Today: A$${todayRevenue.toFixed(2)} from ${todayTx} transactions. Out-of-stock items: ${outOfStockCount}.`;

      const insight = await callClaude(
        `In ONE sentence, give the most important insight about dashboard for ${bizName} based on this data: ${context}. Be specific with numbers. Australian business context.`
      , systemPrompt);

      const priority: Priority = outOfStockCount > 0 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority } satisfies PageInsightResult);
    }

    // Default — no insight for unhandled pages
    return NextResponse.json({ insight: null } satisfies PageInsightResult);
  } catch (err) {
    const e = err as Error;
    console.error('[aria/page-insight] error', {
      message: e?.message,
      stack: e?.stack,
      name: e?.name,
      raw: err,
      anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
      page,
      business_id,
    });
    return NextResponse.json({ insight: null } satisfies PageInsightResult);
  }
}

export const POST = withErrorCapture('aria/page-insight', _POST)
