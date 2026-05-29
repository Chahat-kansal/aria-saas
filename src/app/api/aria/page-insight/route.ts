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
    { route: 'aria/page-insight', model: 'claude-sonnet-4-5-20250929', businessId: undefined, purpose: 'page-insight' },
    () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
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
  let _industry = 'retail'
  try { _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail' } catch { /* keep default */ }
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
        .from('google_reviews')
        .select('id, rating')
        .eq('business_id', business_id)
        .eq('has_reply', false);

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
        .select('id, first_name, last_name, visa_expiry_date')
        .eq('business_id', business_id)
        .lte('visa_expiry_date', thirtyDaysFromNow)
        .gte('visa_expiry_date', today);

      const count = (staff ?? []).length;
      const context = `${count} staff members have visa expiring within 30 days. Names: ${(staff ?? [])
        .slice(0, 3)
        .map(
          (s: { first_name: string; last_name: string; visa_expiry_date: string | null }) =>
            `${s.first_name} ${s.last_name} (expires ${s.visa_expiry_date ?? 'unknown'})`
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

    if (page === 'cash-flow') {
      const { data: sales } = await supabase.from('pos_sales')
        .select('total_amount, created_at, status')
        .eq('business_id', business_id).neq('status', 'voided')
        .gte('created_at', thirtyDaysAgo).limit(2000);
      const { data: expenses } = await supabase.from('business_expenses')
        .select('label, amount').eq('business_id', business_id);
      const rev = (sales ?? []).reduce((s: number, r: { total_amount: number | null }) => s + (Number(r.total_amount ?? 0)), 0);
      const dailyRev = rev / 30;
      const monthExp = (expenses ?? []).reduce((s: number, e: { amount: number | null }) => s + Number(e.amount ?? 0), 0);
      const dailyExp = monthExp / 30;
      const net = dailyRev - dailyExp;
      const ctx = `Last 30d revenue A$${rev.toFixed(0)} (≈A$${dailyRev.toFixed(0)}/day). Monthly fixed expenses entered: A$${monthExp.toFixed(0)} (≈A$${dailyExp.toFixed(0)}/day). Net A$${net.toFixed(0)}/day.${(body.page_data && (body.page_data as { negative_day?: string }).negative_day) ? ` Forecast dips negative on ${(body.page_data as { negative_day?: string }).negative_day}.` : ''}`;
      const insight = await callClaude(`In ONE sentence, give the most important cash-flow insight for ${bizName} from this data: ${ctx}. Be specific with the A$ numbers. If net is negative, suggest one concrete deferral.`, systemPrompt);
      const priority: Priority = net < 0 ? 'critical' : net < dailyExp * 0.2 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/cash-flow' } satisfies PageInsightResult);
    }

    if (page === 'orders') {
      const { data: pos } = await supabase.from('pos_purchase_orders')
        .select('id, status, total_amount, created_at, supplier_id')
        .eq('business_id', business_id).gte('created_at', thirtyDaysAgo);
      const list = pos ?? [];
      const totals = list.map((p: { total_amount: number | null }) => Number(p.total_amount ?? 0));
      const avg = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
      const big = totals.filter(t => avg > 0 && t > avg * 2).length;
      const open = list.filter((p: { status: string | null }) => p.status === 'open' || p.status === 'draft').length;
      const ctx = `Last 30d: ${list.length} purchase orders, ${open} still open. Average order A$${avg.toFixed(0)}. ${big} orders >2× average.`;
      const insight = await callClaude(`In ONE sentence, give the most important orders insight for ${bizName}: ${ctx}. Be specific with numbers.`, systemPrompt);
      const priority: Priority = big > 0 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/orders' } satisfies PageInsightResult);
    }

    if (page === 'stocktake') {
      const { data: products } = await supabase.from('pos_products')
        .select('id, name, stock_quantity').eq('business_id', business_id).eq('track_stock', true).limit(500);
      const { data: sales } = await supabase.from('pos_sale_items')
        .select('product_id, quantity, pos_sales!inner(business_id, created_at)')
        .eq('pos_sales.business_id', business_id).gte('pos_sales.created_at', thirtyDaysAgo).limit(5000);
      type SI = { product_id: string | null; quantity: number | null };
      const sold: Record<string, number> = {};
      for (const r of (sales ?? []) as unknown as SI[]) {
        if (!r.product_id) continue;
        sold[r.product_id] = (sold[r.product_id] ?? 0) + Number(r.quantity ?? 0);
      }
      const fast = (products ?? []).map((p: { id: string; name: string; stock_quantity: number | null }) => ({ name: p.name, stock: Number(p.stock_quantity ?? 0), sold30: sold[p.id] ?? 0 }))
        .filter(p => p.sold30 > 10)
        .sort((a, b) => b.sold30 - a.sold30).slice(0, 5);
      const ctx = `Top movers last 30d (name · current stock · sold): ${fast.map(p => `${p.name} · ${p.stock} · ${p.sold30}`).join('; ')}`;
      const insight = await callClaude(`In ONE sentence, tell ${bizName} which products to count first in their stocktake and why: ${ctx}. Be specific with product names + counts.`, systemPrompt);
      return NextResponse.json({ insight, priority: 'info', link: '/dashboard/stocktake' } satisfies PageInsightResult);
    }

    if (page === 'suppliers') {
      const { data: pos } = await supabase.from('pos_purchase_orders')
        .select('id, supplier_id, created_at, expected_at, received_at, total_amount, pos_suppliers(name)')
        .eq('business_id', business_id).gte('created_at', sixtyDaysAgo).limit(500);
      type Row = { supplier_id: string | null; created_at: string; expected_at: string | null; received_at: string | null; pos_suppliers: { name: string | null } | null };
      const per: Record<string, { name: string; orders: number; late: number; total_cents: number }> = {};
      for (const r of ((pos ?? []) as unknown as Row[])) {
        const k = r.supplier_id ?? 'unknown';
        const name = r.pos_suppliers?.name ?? 'Unknown supplier';
        if (!per[k]) per[k] = { name, orders: 0, late: 0, total_cents: 0 };
        per[k].orders++;
        if (r.expected_at && r.received_at && new Date(r.received_at) > new Date(r.expected_at)) per[k].late++;
      }
      const ranked = Object.values(per).filter(s => s.orders >= 3).sort((a, b) => (b.late / b.orders) - (a.late / a.orders))[0];
      const ctx = ranked ? `Worst on-time supplier last 60d: ${ranked.name} — ${ranked.late} late of ${ranked.orders} orders.` : `Not enough supplier data yet.`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important supplier insight: ${ctx}. Be specific with numbers + the supplier name.`, systemPrompt);
      const priority: Priority = ranked && (ranked.late / ranked.orders) > 0.5 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/suppliers' } satisfies PageInsightResult);
    }

    if (page === 'delivery') {
      const { data: parcels } = await supabase.from('pos_parcel_tracking')
        .select('carrier, carrier_name, status, created_at, delivered_at')
        .eq('business_id', business_id).gte('created_at', sixtyDaysAgo).limit(500);
      type P = { carrier: string | null; carrier_name: string | null; status: string | null; created_at: string; delivered_at: string | null };
      const per: Record<string, { name: string; total: number; days: number[]; late: number }> = {};
      for (const p of (parcels ?? []) as P[]) {
        const k = p.carrier ?? 'other';
        if (!per[k]) per[k] = { name: p.carrier_name ?? k, total: 0, days: [], late: 0 };
        per[k].total++;
        if (p.delivered_at) {
          const d = (new Date(p.delivered_at).getTime() - new Date(p.created_at).getTime()) / 86400000;
          if (d > 0 && d < 60) per[k].days.push(d);
          if (d > 5) per[k].late++;
        }
      }
      const arr = Object.values(per).filter(c => c.total >= 3).map(c => ({ ...c, avg: c.days.length ? c.days.reduce((a, b) => a + b, 0) / c.days.length : null }));
      const ctx = arr.length === 0 ? 'No delivery data yet.' : arr.map(c => `${c.name}: avg ${c.avg ? c.avg.toFixed(1) + 'd' : 'unknown'}, ${c.late}/${c.total} late`).join('; ');
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important delivery insight: ${ctx}. If one carrier is clearly slower than another, name them.`, systemPrompt);
      return NextResponse.json({ insight, priority: 'info', link: '/dashboard/parcel-tracking' } satisfies PageInsightResult);
    }

    if (page === 'bookings') {
      const { data: bks } = await supabase.from('bookings')
        .select('booking_date, booking_time, status, no_show_score, party_size')
        .eq('business_id', business_id).gte('booking_date', thirtyDaysAgo).limit(500);
      type B = { booking_date: string; booking_time: string | null; status: string | null; no_show_score: number | null; party_size: number | null };
      const list = (bks ?? []) as B[];
      const upcoming = list.filter(b => b.booking_date >= today && b.status !== 'cancelled');
      const noShows = list.filter(b => b.status === 'no_show').length;
      const cancelled = list.filter(b => b.status === 'cancelled').length;
      const highRisk = upcoming.filter(b => (b.no_show_score ?? 0) > 0.5).length;
      const ctx = `Last 30d: ${list.length} bookings, ${noShows} no-shows, ${cancelled} cancelled. Upcoming: ${upcoming.length}${highRisk > 0 ? `, ${highRisk} at high no-show risk` : ''}.`;
      const insight = await callClaude(`In ONE sentence, give the most important bookings insight for ${bizName}: ${ctx}. If high no-show risk, suggest sending reminders.`, systemPrompt);
      const priority: Priority = highRisk > 2 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/bookings' } satisfies PageInsightResult);
    }

    if (page === 'invoices') {
      const { getInvoiceStats } = await import('@/lib/aria/invoice-intelligence')
      const s = await getInvoiceStats(supabase, business_id)
      const ctx = `Outstanding ${s.pendingCount} ($${s.pendingTotal.toFixed(0)}), overdue ${s.overdueCount} ($${s.overdueTotal.toFixed(0)}${s.overdueCount ? `, oldest ${s.oldestDays}d` : ''}), paid last 30d ${s.paidCount} ($${s.paidTotal.toFixed(0)}), ${s.draftCount} drafts unsent.${s.topOverdue ? ` Biggest overdue: $${s.topOverdue.amount.toFixed(0)} from ${s.topOverdue.name}, ${s.topOverdue.days}d late.` : ''}`
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important invoice/cash-flow insight: ${ctx}. If overdue invoices exist, name the biggest customer and amount and say to chase today.`, systemPrompt)
      const priority: Priority = s.overdueCount > 0 ? 'warning' : 'info'
      return NextResponse.json({ insight, priority, link: '/dashboard/invoices' } satisfies PageInsightResult)
    }

    if (page === 'quotes' || page === 'quote-builder') {
      const { data: qs } = await supabase.from('quotes')
        .select('status, quote_amount, win_score, view_count, sent_at, created_at, last_viewed_at')
        .eq('business_id', business_id).gte('created_at', sixtyDaysAgo).limit(500);
      type Q = { status: string | null; quote_amount: number | null; win_score: number | null; view_count: number | null; sent_at: string | null; last_viewed_at: string | null };
      const list = (qs ?? []) as Q[];
      const sent = list.filter(q => q.sent_at).length;
      const accepted = list.filter(q => q.status === 'accepted').length;
      const winRate = sent > 0 ? (accepted / sent) * 100 : 0;
      const viewedNotAccepted = list.filter(q => (q.view_count ?? 0) > 0 && q.status !== 'accepted' && q.status !== 'rejected').length;
      const avgAmount = list.length ? list.reduce((s, q) => s + Number(q.quote_amount ?? 0), 0) / list.length : 0;
      const ctx = `Last 60d: ${list.length} quotes, ${sent} sent, ${accepted} accepted (${winRate.toFixed(0)}% win rate). Avg amount A$${avgAmount.toFixed(0)}. ${viewedNotAccepted} viewed but not yet decided.`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important quotes insight: ${ctx}. If there are quotes viewed but not decided, suggest a follow-up.`, systemPrompt);
      const priority: Priority = viewedNotAccepted >= 3 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/quote-builder' } satisfies PageInsightResult);
    }

    if (page === 'loyalty') {
      const { data: custs } = await supabase.from('pos_customers')
        .select('points_balance, loyalty_points, visit_count, last_visit, total_spent, total_spend')
        .eq('business_id', business_id).limit(2000);
      type C = { points_balance: number | null; loyalty_points: number | null; visit_count: number | null; last_visit: string | null; total_spent: number | null; total_spend: number | null };
      const list = (custs ?? []) as C[];
      const enrolled = list.filter(c => (Number(c.points_balance ?? c.loyalty_points ?? 0)) > 0).length;
      const lapsedCutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
      const aboutToLapse = list.filter(c => c.last_visit && c.last_visit < lapsedCutoff && (Number(c.points_balance ?? c.loyalty_points ?? 0)) > 50).length;
      const topPoints = list.map(c => Number(c.points_balance ?? c.loyalty_points ?? 0)).sort((a, b) => b - a).slice(0, 5).reduce((s, n) => s + n, 0);
      const ctx = `${enrolled} customers enrolled in loyalty. ${aboutToLapse} have >50 points and haven't visited in 60+ days. Top 5 customers hold ${topPoints} points combined.`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important loyalty insight: ${ctx}. If lapsing customers exist, suggest a winback reward.`, systemPrompt);
      const priority: Priority = aboutToLapse > 5 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/loyalty' } satisfies PageInsightResult);
    }

    if (page === 'customers') {
      const { data: custs } = await supabase.from('customers')
        .select('customer_segment, churn_risk, last_visit, total_spent')
        .eq('business_id', business_id).limit(2000);
      type C = { customer_segment: string | null; churn_risk: string | null; visit_count: number | null; last_visit: string | null; total_spent: number | null; total_spend: number | null };
      const list = (custs ?? []) as C[];
      const champions = list.filter(c => c.customer_segment === 'champions').length;
      const atRisk = list.filter(c => c.customer_segment === 'at_risk' || c.churn_risk === 'high').length;
      const valueAtRisk = list
        .filter(c => c.customer_segment === 'at_risk' || c.churn_risk === 'high')
        .reduce((s, c) => s + Number(c.total_spent ?? c.total_spend ?? 0), 0);
      const ctx = `${list.length} customers total. ${champions} Champions, ${atRisk} At-Risk (representing A$${valueAtRisk.toFixed(0)} lifetime spend at risk).`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important customers insight: ${ctx}. If lifetime value is at risk, suggest one concrete action.`, systemPrompt);
      const priority: Priority = atRisk > 10 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/customers' } satisfies PageInsightResult);
    }

    if (page === 'marketing') {
      const { data: camps } = await supabase.from('campaigns')
        .select('type, channel, status, sent_count, recipients_count, revenue_attributed_cents, created_at')
        .eq('business_id', business_id).gte('created_at', sixtyDaysAgo).limit(200);
      type Camp = { type: string | null; channel: string | null; status: string | null; sent_count: number | null; recipients_count: number | null; revenue_attributed_cents: number | null };
      const list = (camps ?? []) as Camp[];
      const completed = list.filter(c => c.status === 'completed');
      const totalSent = completed.reduce((s, c) => s + Number(c.sent_count ?? 0), 0);
      const totalRev = completed.reduce((s, c) => s + Number(c.revenue_attributed_cents ?? 0), 0) / 100;
      const drafts = list.filter(c => c.status === 'draft').length;
      const ctx = `Last 60d: ${list.length} campaigns, ${completed.length} sent (${totalSent} messages). Attributed revenue A$${totalRev.toFixed(0)}. ${drafts} drafts waiting.`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important marketing insight: ${ctx}. If there are drafts, suggest one specific send time or audience.`, systemPrompt);
      const priority: Priority = drafts > 2 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/marketing' } satisfies PageInsightResult);
    }

    if (page === 'weekly-reports') {
      const { data: reps } = await supabase.from('weekly_report_records')
        .select('week_starting, revenue, transaction_count, avg_ticket, new_customers, goal_attainment_pct')
        .eq('business_id', business_id).order('week_starting', { ascending: false }).limit(4);
      type R = { week_starting: string; revenue: number | null; transaction_count: number | null; avg_ticket: number | null; new_customers: number | null; goal_attainment_pct: number | null };
      const list = (reps ?? []) as R[];
      if (list.length === 0) return NextResponse.json({ insight: null, link: '/dashboard/weekly-reports' } satisfies PageInsightResult);
      const latest = list[0];
      const prior = list[1];
      const revDelta = prior?.revenue && Number(prior.revenue) > 0 ? ((Number(latest.revenue ?? 0) - Number(prior.revenue)) / Number(prior.revenue)) * 100 : null;
      const ctx = `Latest week (${latest.week_starting}): A$${Number(latest.revenue ?? 0).toFixed(0)} revenue, ${latest.transaction_count ?? 0} transactions${revDelta != null ? `, ${revDelta > 0 ? '+' : ''}${revDelta.toFixed(0)}% vs prior week` : ''}. Goal attainment: ${latest.goal_attainment_pct ?? 'n/a'}%.`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important weekly-report narrative: ${ctx}. Plain owner language, what mattered most this week.`, systemPrompt);
      const priority: Priority = revDelta != null && revDelta < -10 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/weekly-reports' } satisfies PageInsightResult);
    }

    if (page === 'shift-reports') {
      const { data: shifts } = await supabase.from('pos_shift_reports')
        .select('shift_start, total_revenue, variance_cents, labour_ratio_pct, revenue_per_hour')
        .eq('business_id', business_id).gte('shift_start', thirtyDaysAgo).order('shift_start', { ascending: false }).limit(50);
      type S = { shift_start: string; total_revenue: number | null; variance_cents: number | null; labour_ratio_pct: number | null; revenue_per_hour: number | null };
      const list = (shifts ?? []) as S[];
      if (list.length === 0) return NextResponse.json({ insight: null, link: '/dashboard/shift-reports' } satisfies PageInsightResult);
      const variances = list.filter(s => Math.abs(Number(s.variance_cents ?? 0)) > 1000).length;
      const ratios = list.map(s => Number(s.labour_ratio_pct ?? 0)).filter(r => r > 0);
      const avgLabour = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
      const highLabour = list.filter(s => Number(s.labour_ratio_pct ?? 0) > 40).length;
      const ctx = `Last 30d: ${list.length} shifts. ${variances} had cash variance >A$10. Avg labour ratio ${avgLabour.toFixed(0)}%${highLabour > 0 ? `, ${highLabour} shifts above 40%` : ''}.`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important shift-report insight: ${ctx}. If labour ratio or variances are concerning, name the specific issue.`, systemPrompt);
      const priority: Priority = highLabour > 3 || variances > 5 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/shift-reports' } satisfies PageInsightResult);
    }

    if (page === 'seo') {
      const { data: audits } = await supabase.from('seo_audits')
        .select('health_score, issues_found, issues_fixed, pages_crawled, finished_at')
        .eq('business_id', business_id).order('started_at', { ascending: false }).limit(1);
      const { data: issues } = await supabase.from('seo_issues')
        .select('severity, issue_type, state')
        .eq('business_id', business_id).neq('state', 'fixed').limit(200);
      type I = { severity: string | null; issue_type: string | null; state: string | null };
      const list = (issues ?? []) as I[];
      const critical = list.filter(i => i.severity === 'critical' || i.severity === 'high').length;
      const total = list.length;
      const score = (audits ?? [])[0]?.health_score ?? null;
      if (total === 0 && score == null) return NextResponse.json({ insight: null, link: '/dashboard/seo' } satisfies PageInsightResult);
      const ctx = `SEO health score: ${score ?? 'not yet measured'}. ${total} open issues (${critical} high/critical priority).`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important SEO insight: ${ctx}. If critical issues exist, name the highest-impact fix.`, systemPrompt);
      const priority: Priority = critical > 3 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/seo' } satisfies PageInsightResult);
    }

    if (page === 'missed-demand') {
      const { data: items } = await supabase.from('missed_demand')
        .select('product_name, times_requested, estimated_monthly_revenue_cents, status, last_requested_at')
        .eq('business_id', business_id).gte('last_requested_at', thirtyDaysAgo).limit(200);
      type M = { product_name: string; times_requested: number | null; estimated_monthly_revenue_cents: number | null; status: string | null };
      const list = (items ?? []) as M[];
      if (list.length === 0) return NextResponse.json({ insight: null, link: '/dashboard/missed-demand' } satisfies PageInsightResult);
      const pending = list.filter(i => i.status === 'pending').length;
      const top = [...list].sort((a, b) => Number(b.times_requested ?? 0) - Number(a.times_requested ?? 0))[0];
      const revOpportunity = list.reduce((s, i) => s + Number(i.estimated_monthly_revenue_cents ?? 0), 0) / 100;
      const ctx = `Last 30d: ${list.length} missed-demand items (${pending} pending review). Top requested: ${top?.product_name ?? 'unknown'} (${top?.times_requested ?? 0} times). Estimated monthly revenue opportunity: A$${revOpportunity.toFixed(0)}.`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} the most important missed-demand insight: ${ctx}. Recommend the one product to stock first.`, systemPrompt);
      const priority: Priority = revOpportunity > 500 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/missed-demand' } satisfies PageInsightResult);
    }

    if (page === 'slow-day') {
      const { data: sales } = await supabase.from('pos_sales')
        .select('total_amount, created_at, status')
        .eq('business_id', business_id).neq('status', 'voided')
        .gte('created_at', sixtyDaysAgo).limit(3000);
      type S = { total_amount: number | null; created_at: string };
      const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const byDow: Record<number, { rev: number; tx: number }> = {};
      for (const s of (sales ?? []) as S[]) {
        const dow = new Date(s.created_at).getDay();
        if (!byDow[dow]) byDow[dow] = { rev: 0, tx: 0 };
        byDow[dow].rev += Number(s.total_amount ?? 0);
        byDow[dow].tx++;
      }
      const entries = Object.entries(byDow).map(([d, v]) => ({ dow: parseInt(d), avg: v.tx > 0 ? v.rev / v.tx : 0, total: v.rev }));
      if (entries.length < 3) return NextResponse.json({ insight: null, link: '/dashboard/slow-day' } satisfies PageInsightResult);
      const sorted = entries.sort((a, b) => a.total - b.total);
      const slowest = sorted[0];
      const best = sorted[sorted.length - 1];
      const gapPct = best.total > 0 ? ((best.total - slowest.total) / best.total) * 100 : 0;
      const ctx = `Slowest day last 60d: ${DAYS[slowest.dow]} (A$${slowest.total.toFixed(0)} total). Best day: ${DAYS[best.dow]} (A$${best.total.toFixed(0)}). Gap ${gapPct.toFixed(0)}%.`;
      const insight = await callClaude(`In ONE sentence, give ${bizName} one specific promo idea to lift ${DAYS[slowest.dow]} sales: ${ctx}. Be concrete about the offer.`, systemPrompt);
      const priority: Priority = gapPct > 50 ? 'warning' : 'info';
      return NextResponse.json({ insight, priority, link: '/dashboard/slow-day' } satisfies PageInsightResult);
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
