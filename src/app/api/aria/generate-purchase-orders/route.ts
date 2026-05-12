export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBusinessSales, getBusinessItems } from '@/lib/business-data';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AU_HOLIDAYS_2026 = [
  { name: "Queen's Birthday (VIC)", date: '2026-06-09', uplift: 1.3 },
  { name: 'EOFY', date: '2026-06-30', uplift: 1.5 },
  { name: 'AFL Grand Final', date: '2026-09-26', uplift: 1.8 },
  { name: 'Melbourne Cup', date: '2026-11-03', uplift: 1.4 },
  { name: 'Christmas Eve', date: '2026-12-24', uplift: 2.2 },
  { name: 'Christmas Day', date: '2026-12-25', uplift: 2.0 },
  { name: 'Boxing Day', date: '2026-12-26', uplift: 1.8 },
  { name: "New Year's Eve", date: '2026-12-31', uplift: 1.6 },
];

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const business_id = body.business_id ?? body.businessId;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, data_source')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const dataSource = (biz.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  const sixtyDaysOut = new Date(Date.now() + 60 * 86400000);

  // Holidays within next 60 days
  const upcomingHolidays = AU_HOLIDAYS_2026.filter(h => {
    const d = new Date(h.date);
    return d >= new Date() && d <= sixtyDaysOut;
  });

  const [items, sales30, openPOs] = await Promise.all([
    getBusinessItems(business_id, dataSource),
    getBusinessSales(business_id, thirtyDaysAgo, dataSource),
    supabase.from('warehouse_purchase_orders')
      .select('line_items')
      .eq('business_id', business_id)
      .in('status', ['draft', 'sent']),
  ]);

  // Build velocity map from 30-day sales
  const unitsSold30: Record<string, number> = {};
  for (const sale of sales30) {
    for (const li of sale.lineItems) {
      const id = li.itemId;
      unitsSold30[id] = (unitsSold30[id] ?? 0) + li.quantity;
    }
  }

  // Items already on open POs (avoid double-ordering)
  const alreadyOnPO = new Set<string>();
  for (const po of openPOs.data ?? []) {
    for (const li of (po.line_items ?? []) as any[]) {
      if (li.item_id) alreadyOnPO.add(li.item_id);
    }
  }

  // Max holiday uplift within 14 days
  const in14Days = new Date(Date.now() + 14 * 86400000);
  const nearHolidays = AU_HOLIDAYS_2026.filter(h => new Date(h.date) <= in14Days && new Date(h.date) >= new Date());
  const maxUplift = nearHolidays.length > 0 ? Math.max(...nearHolidays.map(h => h.uplift)) : 1.0;
  const holidayNote = nearHolidays.length > 0 ? nearHolidays[0].name : null;

  // Calculate suggestions per item
  type Suggestion = {
    item_id: string; item_name: string; current_stock: number;
    daily_velocity: number; days_of_stock: number;
    suggested_quantity: number; holiday_note: string | null;
    urgency: string; reason: string; cost_price: number;
  };

  const suggestions: Suggestion[] = [];
  for (const item of items) {
    if (alreadyOnPO.has(item.id)) continue;

    const sold30 = unitsSold30[item.id] ?? unitsSold30[item.externalId] ?? 0;
    const velocity = Math.max(sold30 / 30, 0.1);
    const stock = item.currentStock;
    const days_of_stock = stock / velocity;

    const reorderPt = item.reorderPoint ?? 0;
    const needsReorder = stock <= reorderPt || stock === 0;
    if (!needsReorder && days_of_stock > 30) continue;

    const adjusted_velocity = velocity * maxUplift;
    const suggested_quantity = Math.max(0, Math.ceil((adjusted_velocity * 30) - stock));
    if (suggested_quantity === 0) continue;

    const urgency =
      days_of_stock <= 3 ? 'critical' :
      days_of_stock <= 7 ? 'high' :
      days_of_stock <= 14 ? 'medium' : 'low';

    suggestions.push({
      item_id: item.id,
      item_name: item.name,
      current_stock: stock,
      daily_velocity: Math.round(velocity * 100) / 100,
      days_of_stock: Math.round(days_of_stock),
      suggested_quantity,
      holiday_note: maxUplift > 1.0 ? holidayNote : null,
      urgency,
      reason: maxUplift > 1.0
        ? `${days_of_stock.toFixed(0)}d stock; ${holidayNote} uplift applied`
        : `${days_of_stock.toFixed(0)} days of stock remaining`,
      cost_price: item.costCents / 100,
    });
  }

  if (suggestions.length === 0) {
    return NextResponse.json({
      purchase_orders: [],
      ai_summary: 'All items have sufficient stock. No reorders needed right now.',
      holiday_alerts: upcomingHolidays.map(h => `${h.name} (${h.date}) — consider stocking up`),
      total_items: 0,
      total_estimated_value_cents: 0,
      orders: [],
    });
  }

  // Group by item — no supplier info in this simplified view
  const groupedSuggestions = [{
    supplier_id: null,
    supplier_name: 'All Suppliers',
    items: suggestions,
    estimated_total_cents: suggestions.reduce((s, i) => s + i.suggested_quantity * Math.round(i.cost_price * 100), 0),
    recommended_order_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
  }];

  let result: any = null;
  try {
    const msg = await trackAICall({ route: 'aria/generate-purchase-orders', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'purchase-order-generate' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: 'You are Aria. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Review and finalise these purchase order suggestions for ${biz.name}. Ensure no negative quantities. Apply common sense (round to case quantities where obvious). Return JSON:
{
  "purchase_orders": [{"supplier_id":null,"supplier_name":"All Suppliers","items":[{"item_id":"","item_name":"","current_stock":0,"daily_velocity":0,"days_of_stock":0,"suggested_quantity":0,"holiday_note":null,"urgency":"medium","reason":""}],"estimated_total_cents":0,"recommended_order_date":""}],
  "ai_summary": "2-sentence summary",
  "holiday_alerts": [],
  "total_items": 0,
  "total_estimated_value_cents": 0
}

Data: ${JSON.stringify(groupedSuggestions)}`,
      }],
    }));
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) result = JSON.parse(match[0]);
  } catch { /* use raw suggestions */ }

  if (!result) {
    result = {
      purchase_orders: groupedSuggestions,
      ai_summary: `${suggestions.length} items need reordering. ${suggestions.filter(s => s.urgency === 'critical').length} critical.`,
      holiday_alerts: upcomingHolidays.map(h => `${h.name} (${h.date})`),
      total_items: suggestions.length,
      total_estimated_value_cents: groupedSuggestions[0].estimated_total_cents,
    };
  }

  // Also return in legacy format for backwards compat
  const legacyOrders = suggestions.map(s => ({
    item_id: s.item_id,
    item_name: s.item_name,
    current_stock: s.current_stock,
    suggested_qty: s.suggested_quantity,
    reason: s.reason,
    estimated_cost_aud: Math.round(s.cost_price * s.suggested_quantity * 100) / 100,
  }));

  return NextResponse.json({ ...result, orders: legacyOrders });
}

export const POST = withErrorCapture('aria/generate-purchase-orders', _POST)
