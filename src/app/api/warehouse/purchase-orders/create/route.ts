export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { business_id, supplier_id, supplier_name, items, recommended_order_date } = body;
  if (!business_id || !items?.length) {
    return NextResponse.json({ error: 'business_id and items required' }, { status: 400 });
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Generate PO number
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const po_number = `PO-${date}-${suffix}`;

  const total_cost_cents = (items as any[]).reduce((s: number, i: any) => s + Math.round((i.estimated_cost_aud ?? (i.estimated_cost_cents ?? 0) / 100) * 100), 0);

  const line_items = (items as any[]).map((i: any) => ({
    item_id: i.item_id,
    item_name: i.item_name,
    current_stock: i.current_stock ?? 0,
    suggested_qty: i.quantity ?? i.suggested_qty ?? 0,
    estimated_cost_aud: i.estimated_cost_aud ?? (i.estimated_cost_cents ?? 0) / 100,
    reason: i.reason ?? '',
    urgency: i.urgency ?? 'medium',
  }));

  const { data, error: e } = await supabase
    .from('warehouse_purchase_orders')
    .insert({
      business_id,
      po_number,
      supplier_id: supplier_id ?? null,
      supplier_name: supplier_name ?? null,
      status: 'draft',
      line_items,
      total_cost_cents,
      expected_delivery: recommended_order_date ?? null,
      notes: 'Created from AI purchase order generation',
    })
    .select()
    .single();

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true, po_id: data.id, po_number });
}
