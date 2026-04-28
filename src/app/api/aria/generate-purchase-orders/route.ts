import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBusinessSales, getBusinessItems } from '@/lib/business-data';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, data_source, name').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const dataSource = (biz.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [items, sales] = await Promise.all([
    getBusinessItems(business_id, dataSource),
    getBusinessSales(business_id, thirtyDaysAgo, dataSource),
  ]);

  // Calculate velocity
  const unitsSold: Record<string, number> = {};
  for (const sale of sales) {
    for (const li of sale.lineItems) {
      unitsSold[li.itemId] = (unitsSold[li.itemId] ?? 0) + li.quantity;
    }
  }

  const lowStock = items
    .map(i => ({
      id: i.id,
      name: i.name,
      stock: i.currentStock,
      velocity30d: unitsSold[i.id] ?? unitsSold[i.externalId] ?? 0,
      reorder_point: i.reorderPoint,
      cost: i.costCents / 100,
    }))
    .filter(i => i.stock <= (i.reorder_point || Math.ceil(i.velocity30d * 0.5)))
    .sort((a, b) => b.velocity30d - a.velocity30d)
    .slice(0, 20);

  if (!lowStock.length) return NextResponse.json({ orders: [] });

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: 'You are a procurement AI. Return ONLY valid JSON array, no markdown.',
      messages: [{
        role: 'user',
        content: `Generate purchase order suggestions. For each item, suggest a reorder quantity (cover ~30 days demand) and group by supplier where possible.
Return JSON: [{"item_id":"id","item_name":"name","current_stock":N,"suggested_qty":N,"reason":"brief","estimated_cost_aud":N}]

Items needing reorder: ${JSON.stringify(lowStock)}
Today: ${new Date().toISOString().split('T')[0]}`,
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    const lineItems = arrMatch ? JSON.parse(arrMatch[0]) : [];

    // Create a draft PO in the DB
    if (lineItems.length) {
      const totalCents = lineItems.reduce((s: number, li: any) => s + Math.round((li.estimated_cost_aud ?? 0) * 100), 0);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const { count } = await supabase.from('warehouse_purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .like('po_number', `PO-${date}%`);
      const seq = String((count ?? 0) + 1).padStart(3, '0');
      await supabase.from('warehouse_purchase_orders').insert({
        business_id,
        po_number: `PO-${date}-${seq}`,
        status: 'draft',
        line_items: lineItems,
        total_cost_cents: totalCents,
        notes: 'AI-generated based on 30-day velocity and current stock levels.',
      }).then(() => null, () => null);
    }

    return NextResponse.json({ orders: lineItems });
  } catch { return NextResponse.json({ orders: [] }); }
}
