export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getWeatherForecast, getUpcomingHolidays, getWeatherUplift } from '@/lib/external-apis';
import { trackUsage } from '@/lib/track-usage';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveUnitCost } from '@/lib/orders/resolve-unit-cost'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, week_starting } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id,name,city,industry')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  trackUsage({ business_id, event_type: 'weekly_order' });

  const [
    { data: products },
    { data: salesItems },
    { data: suppliers },
    weather,
  ] = await Promise.all([
    supabase.from('pos_products')
      .select('id,name,barcode,sku,stock_quantity,cost_price,track_inventory,supplier_id,category_id,pos_categories(name)')
      .eq('business_id', business_id).eq('is_active', true).eq('track_inventory', true),
    supabase.from('pos_sale_items')
      .select('product_id,product_name,quantity,created_at')
      .eq('business_id', business_id)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabase.from('pos_suppliers').select('id,name,email').eq('business_id', business_id).order('name'),
    getWeatherForecast(biz.city || 'Melbourne').catch(() => []),
  ]);

  const holidays = getUpcomingHolidays(14, 'VIC');
  const hotWeekend = (weather as any[]).slice(0, 7).some((d: any) => d.is_hot);

  // Calculate daily velocity per product (last 30 days)
  const velocity: Record<string, number> = {};
  for (const item of (salesItems || [])) {
    if (!item.product_id) continue;
    velocity[item.product_id] = (velocity[item.product_id] || 0) + item.quantity;
  }

  const orderItems: any[] = [];

  for (const product of (products || [])) {
    const dailyVelocity = (velocity[product.id] || 0) / 30;
    const stock = product.stock_quantity ?? 0;
    const daysOfStock = dailyVelocity > 0 ? stock / dailyVelocity : 999;

    const categoryName = (product as any).pos_categories?.name || '';
    const weatherUplift = getWeatherUplift(weather as any[], categoryName);
    const nextHolidayImpact = holidays[0]?.days_away <= 7 ? (holidays[0] as any).impact ?? 1.2 : 1.0;
    const combinedUplift = weatherUplift * (daysOfStock < 7 ? nextHolidayImpact : 1.0);

    const weeklyDemand = dailyVelocity * 7 * combinedUplift;
    const targetStock  = weeklyDemand * 2; // 2-week buffer
    const suggestedQty = Math.max(0, Math.ceil(targetStock - stock));

    if (suggestedQty <= 0 && daysOfStock > 14) continue;
    if (dailyVelocity === 0 && stock > 5) continue;

    let reason = '';
    if (daysOfStock < 3)       reason = `URGENT: ${Math.ceil(daysOfStock)} days stock remaining`;
    else if (daysOfStock < 7)  reason = `Low: ${Math.ceil(daysOfStock)} days stock remaining`;
    else if (hotWeekend && ['Beer & Cider','Soft Drinks','Water','RTD','Beverages'].some(c => categoryName.includes(c)))
      reason = `Hot weekend forecast — stock up`;
    else if (holidays.length > 0 && holidays[0].days_away <= 7)
      reason = `${holidays[0].name} in ${holidays[0].days_away} days — holiday uplift`;
    else reason = `Regular replenishment — ${Math.ceil(daysOfStock)} days stock`;

    const unitCost = await resolveUnitCost(supabase, product.id, business_id, {
      productCostPrice: product.cost_price,
    })
    const unitCostCents = Math.round(unitCost * 100)
    const isEstimatedCost = !product.cost_price || product.cost_price === 0

    orderItems.push({
      product_id: product.id,
      product_name: product.name,
      barcode: product.barcode,
      sku: product.sku,
      category: categoryName,
      current_stock: stock,
      days_of_stock: Math.round(daysOfStock * 10) / 10,
      daily_velocity: Math.round(dailyVelocity * 100) / 100,
      suggested_qty: suggestedQty,
      manual_qty: null,
      unit_cost_cents: unitCostCents,
      total_cost_cents: suggestedQty * unitCostCents,
      is_estimated_cost: isEstimatedCost,
      reason,
      weather_uplift: combinedUplift > 1.1 ? Math.round(combinedUplift * 100) / 100 : null,
      supplier_id: product.supplier_id,
    });
  }

  // Sort: urgent first, then by category
  orderItems.sort((a, b) => {
    if (a.days_of_stock < 3 && b.days_of_stock >= 3) return -1;
    if (b.days_of_stock < 3 && a.days_of_stock >= 3) return 1;
    return a.category.localeCompare(b.category);
  });

  const totalCost = orderItems.reduce((s, i) => s + i.total_cost_cents, 0);
  const urgentItems = orderItems.filter(i => i.days_of_stock < 3);

  if (!orderItems.length) {
    return NextResponse.json({
      draft: null,
      items: [],
      total_cost_cents: 0,
      reasoning: 'All tracked products have sufficient stock — no reorder needed this week.',
      urgent_count: 0,
      suppliers: suppliers || [],
    })
  }

  const weekStarting = week_starting || (() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0];
  })();

  const reasoning = [
    `Analysed 30 days of sales and current stock levels for ${orderItems.length} tracked products.`,
    urgentItems.length > 0
      ? `⚠️ ${urgentItems.length} urgent: ${urgentItems.slice(0, 3).map(i => i.product_name).join(', ')}.`
      : 'No stockouts imminent.',
    hotWeekend ? 'Hot weekend forecast — cold drink quantities uplifted.' : '',
    holidays.length > 0 && holidays[0].days_away <= 7
      ? `${holidays[0].name} in ${holidays[0].days_away} days — quantities adjusted.` : '',
    `Total order: A$${(totalCost / 100).toFixed(2)} across ${orderItems.length} products.`,
  ].filter(Boolean).join(' ');

  const { data: draft } = await supabase.from('purchase_order_drafts').insert({
    business_id,
    draft_type: 'ai_generated',
    status: 'pending_approval',
    items: orderItems,
    total_cost_cents: totalCost,
    aria_reasoning: reasoning,
    week_starting: weekStarting,
  }).select().single();

  return NextResponse.json({
    draft,
    items: orderItems,
    total_cost_cents: totalCost,
    reasoning,
    urgent_count: urgentItems.length,
    suppliers: suppliers || [],
  });
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: drafts, error } = await supabase.from('purchase_order_drafts')
    .select('*').eq('business_id', business_id)
    .order('created_at', { ascending: false }).limit(20);

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ drafts: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ drafts: drafts ?? [] });
}

export const GET = withErrorCapture('aria/weekly-order', _GET)
export const POST = withErrorCapture('aria/weekly-order', _POST)
