export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { getRBAData, getABSRetailBenchmarks } from '@/lib/external-apis';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const business_id = body.business_id ?? body.businessId;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, industry, city, data_source')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const twoWeeksOut = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  const [rbaData, absData] = await Promise.all([
    getRBAData().catch(() => null),
    getABSRetailBenchmarks().catch(() => null),
  ]);

  // Run all 6 analyses in parallel
  const [
    productsRes,
    saleItemsRes,
    discountRes,
    salesLast90Res,
    expiryRes,
    belowCostRes,
    outOfStockRes,
  ] = await Promise.all([
    // Products with stock
    supabase.from('pos_products')
      .select('id, name, stock_quantity, cost_price, price, is_active')
      .eq('business_id', business_id)
      .gt('stock_quantity', 0),
    // All sale items in last 60 days to find movement
    supabase.from('pos_sale_items')
      .select('product_id, quantity, unit_price')
      .gte('created_at', sixtyDaysAgo)
      .in('sale_id',
        (await supabase.from('pos_sales').select('id')
          .eq('business_id', business_id)
          .gte('created_at', sixtyDaysAgo)).data?.map((s: any) => s.id) ?? []
      ),
    // Discounts given in last 30 days
    supabase.from('pos_sales')
      .select('id, discount_amount, total_amount')
      .eq('business_id', business_id)
      .gte('created_at', thirtyDaysAgo)
      .gt('discount_amount', 0),
    // Sales last 90 days for slow day analysis
    supabase.from('pos_sales')
      .select('total_amount, created_at')
      .eq('business_id', business_id)
      .gte('created_at', ninetyDaysAgo),
    // Expiring lots (warehouse)
    supabase.from('warehouse_lots')
      .select('item_name, lot_number, quantity_remaining, unit_cost_cents, expiry_date')
      .eq('business_id', business_id)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .lte('expiry_date', twoWeeksOut),
    // Below cost products
    supabase.from('pos_products')
      .select('id, name, price, cost_price')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .gt('cost_price', 0),
    // Out-of-stock active products — separate query, not derived from belowCostRes
    supabase.from('pos_products')
      .select('id, name, price, stock_quantity')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .lte('stock_quantity', 0),
  ]);

  const products = productsRes.data ?? [];
  const saleItems = saleItemsRes.data ?? [];
  const discountSales = discountRes.data ?? [];
  const sales90 = salesLast90Res.data ?? [];
  const expiringLots = expiryRes.data ?? [];
  const allProducts = belowCostRes.data ?? [];
  const outOfStockProducts = outOfStockRes.data ?? [];

  if (belowCostRes.error) Sentry.captureException(belowCostRes.error, { tags: { route: 'aria/profit-analysis', query: 'belowCost' } });
  if (outOfStockRes.error) Sentry.captureException(outOfStockRes.error, { tags: { route: 'aria/profit-analysis', query: 'outOfStock' } });

  // ANALYSIS 1 — Dead stock
  const soldProductIds = new Set(saleItems.map((si: any) => si.product_id));
  const deadStock = products.filter((p: any) => !soldProductIds.has(p.id) && p.stock_quantity > 0);
  const deadStockItems = deadStock.map((p: any) => ({
    name: p.name,
    qty: p.stock_quantity,
    value_cents: Math.round(p.stock_quantity * (p.cost_price ?? 0) * 100),
  }));
  const deadStockTotal = deadStockItems.reduce((s: number, i: any) => s + i.value_cents, 0);

  // ANALYSIS 2 — Discounting
  const totalDiscountCents = discountSales.reduce((s: number, sale: any) => s + Math.round((sale.discount_amount ?? 0) * 100), 0);

  // ANALYSIS 3 — Stockout revenue loss
  // velocityMap: units sold per product_id over last 60 days
  const velocityMap: Record<string, number> = {};
  for (const si of saleItems) {
    const id = (si as any).product_id;
    velocityMap[id] = (velocityMap[id] ?? 0) + ((si as any).quantity ?? 1);
  }
  // Only count out-of-stock products that have a real sales velocity (i.e. were selling)
  const stockoutItems = outOfStockProducts
    .map((p: any) => {
      const units60d = velocityMap[p.id] ?? 0;
      const dailyVelocity = units60d / 60;
      const priceCents = Math.round((p.price ?? 0) * 100);
      return {
        name: p.name,
        units_sold_60d: units60d,
        estimated_daily_loss_cents: Math.round(dailyVelocity * priceCents),
      };
    })
    .filter((i: any) => i.units_sold_60d > 0);
  // Revenue lost = daily velocity × price × 3 days (conservative avg stockout duration)
  const stockoutTotal = stockoutItems.reduce(
    (total: number, item: any) => total + item.estimated_daily_loss_cents * 3,
    0,
  );

  // ANALYSIS 4 — Expiry risk (warehouse)
  const expiryItems = expiringLots.map((l: any) => ({
    name: l.item_name,
    lot: l.lot_number,
    qty: l.quantity_remaining,
    value_cents: Math.round(l.quantity_remaining * (l.unit_cost_cents ?? 0)),
    days: Math.ceil((new Date(l.expiry_date).getTime() - Date.now()) / 86400000),
  }));
  const expiryTotal = expiryItems.reduce((s: number, i: any) => s + i.value_cents, 0);

  // ANALYSIS 5 — Slow day revenue gap
  const dowRevenue: Record<number, number[]> = {};
  for (const sale of sales90) {
    const dow = new Date((sale as any).created_at).getDay();
    if (!dowRevenue[dow]) dowRevenue[dow] = [];
    dowRevenue[dow].push(Math.round((sale as any).total_amount * 100));
  }
  const dowAvgs = Object.entries(dowRevenue).map(([dow, vals]) => ({
    dow: parseInt(dow),
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  }));
  const overallAvg = dowAvgs.reduce((s, d) => s + d.avg, 0) / Math.max(dowAvgs.length, 1);
  const slowestDay = dowAvgs.sort((a, b) => a.avg - b.avg)[0];
  const slowDayGap = slowestDay ? Math.max(0, overallAvg - slowestDay.avg) : 0;
  const slowDayLabel = slowestDay ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][slowestDay.dow] : null;
  // Annualised: ~13 occurrences in 90 days, × 52/13 weeks = 52 occurrences/year
  const slowDayAnnual = Math.round(slowDayGap * 52);

  // ANALYSIS 6 — Below cost pricing
  const belowCost = allProducts.filter((p: any) => p.price > 0 && p.cost_price > 0 && p.price <= p.cost_price);
  const belowCostItems = belowCost.map((p: any) => ({
    name: p.name,
    price: p.price,
    cost: p.cost_price,
  }));

  const analyses = {
    dead_stock: { items: deadStockItems.slice(0, 10), total_cents: deadStockTotal },
    discounting: { total_discount_cents: totalDiscountCents, transaction_count: discountSales.length },
    stockout: { items: stockoutItems.slice(0, 10), total_cents: stockoutTotal },
    expiry_risk: { items: expiryItems.slice(0, 10), total_cents: expiryTotal },
    slow_days: { slowest_day: slowDayLabel, gap_cents: Math.round(slowDayGap), estimated_annual_impact: slowDayAnnual },
    below_cost: { items: belowCostItems.slice(0, 10), count: belowCostItems.length },
  };

  // If no meaningful data at all, return early with helpful message
  const hasAnyData = deadStockTotal > 0 || totalDiscountCents > 0 || stockoutTotal > 0 || expiryTotal > 0 || slowDayGap > 100 || belowCostItems.length > 0;

  let leaks: any[] = [];
  let aiSummary = '';
  let totalMonthlyCents = 0;

  if (hasAnyData) {
    try {
      const economicContext = rbaData || absData ? `RBA cash rate: ${rbaData?.cash_rate_pct ?? 'N/A'}%, ABS retail growth: ${absData?.monthly_retail_turnover_growth_pct ?? 'N/A'}%, CPI: ${absData?.cpi_annual_pct ?? 'N/A'}%` : '';

      const { ariaValidate } = await import('@/lib/ai-router')
      const decision = `Identify profit leaks for ${business.name}, a ${business.industry} in ${business.city ?? 'Australia'}. Return JSON: {"leaks":[{"id","type","title","description","estimated_monthly_impact_cents","priority","action","action_type","action_href"}],"total_monthly_impact_cents","ai_summary"}`
      const raw = await ariaValidate(decision, { analyses, economic: economicContext })
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0]);
        leaks = parsed.leaks ?? [];
        aiSummary = parsed.ai_summary ?? '';
        totalMonthlyCents = parsed.total_monthly_impact_cents ?? 0;
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { route: 'aria/profit-analysis' } });
      // Build basic leaks from raw data without AI
      if (deadStockTotal > 0) leaks.push({ id: 'dead-stock-1', type: 'dead_stock', title: `${deadStockItems.length} products with no sales (60d)`, description: `A$${(deadStockTotal / 100).toFixed(0)} tied up in unsold inventory.`, estimated_monthly_impact_cents: 0, priority: 'high', action: 'Review these real dead-stock products and decide whether to clear them.', action_type: 'promote', action_href: '/pos/products', stock_value_cents: deadStockTotal });
      if (belowCostItems.length > 0) leaks.push({ id: 'below-cost-1', type: 'below_cost', title: `${belowCostItems.length} products priced below cost`, description: 'Items selling below recorded cost price.', estimated_monthly_impact_cents: 0, priority: 'critical', action: 'Review and correct pricing immediately.', action_type: 'reprice', action_href: '/pos/products' });
      aiSummary = 'AI analysis temporarily unavailable. Raw data shown below.';
      totalMonthlyCents = leaks.reduce((s: number, l: any) => s + l.estimated_monthly_impact_cents, 0);
    }
  } else {
    leaks = [];
    aiSummary = 'No significant profit leaks detected. Keep recording sales to get more accurate analysis.';
    totalMonthlyCents = 0;
  }

  // Upsert into profit_leaks table
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('profit_leaks').delete().eq('business_id', business_id).gte('created_at', `${today}T00:00:00`);
  if (leaks.length > 0) {
    await supabase.from('profit_leaks').insert(
      leaks.map((l: any) => ({
        business_id,
        category: l.type,
        title: l.title,
        description: l.description,
        monthly_loss: Math.round(l.estimated_monthly_impact_cents / 100),
        fix_suggestion: l.action,
        status: 'detected',
        metadata: { priority: l.priority, action_type: l.action_type, action_href: l.action_href },
      }))
    ).then(() => null, () => null);
  }

  await supabase.from('activity_log').insert({
    business_id,
    action_type: 'leak',
    description: leaks.length > 0
      ? `Aria detected ${leaks.length} profit leaks worth A$${(totalMonthlyCents / 100).toFixed(0)}/mo`
      : 'Aria ran profit analysis — no significant leaks found',
  }).then(() => null, () => null);

  // Generate a discovery moment — the single most surprising finding
  let discovery = '';
  if (leaks.length > 0) {
    try {
      const topLeak = leaks.sort((a: any, b: any) => b.estimated_monthly_impact_cents - a.estimated_monthly_impact_cents)[0] as any;
      const { ariaChat } = await import('@/lib/ai-router')
      discovery = (await ariaChat(
        'profit_leaks',
        `Write 2 sentences as Aria discovering a profit leak for an Australian business. Finding: "${topLeak.title}" — ${topLeak.description}. Monthly impact: A$${(totalMonthlyCents / 100).toFixed(0)}. Be specific with numbers.`,
        120
      )).trim()
    } catch { /* non-fatal */ }
    if (!discovery) {
      const top = leaks.sort((a: any, b: any) => b.estimated_monthly_impact_cents - a.estimated_monthly_impact_cents)[0] as any;
      discovery = `I found ${leaks.length} profit leak${leaks.length > 1 ? 's' : ''} costing an estimated A$${(totalMonthlyCents / 100).toFixed(0)}/month. The biggest: ${top.title}.`;
    }
  }

  return NextResponse.json({ leaks, total_monthly_impact_cents: totalMonthlyCents, ai_summary: aiSummary, discovery, analyses });
}

export const POST = withErrorCapture('aria/profit-analysis', _POST)
