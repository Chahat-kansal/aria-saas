export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, notes } = await req.json();

  const { data: session } = await supabase.from('mobile_inventory_sessions')
    .select('*').eq('id', params.id).maybeSingle();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const bid = business_id || session.business_id;
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', bid).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const items = session.scanned_items as any[];

  if (session.session_type === 'count') {
    // Batch update stock quantities
    await Promise.all(items.map((item: any) =>
      supabase.from('pos_products').update({ stock_quantity: item.scanned_qty })
        .eq('id', item.product_id).eq('business_id', bid)
    ));
  }

  if (session.session_type === 'receive') {
    // Add received quantities to current stock
    for (const item of items) {
      const { data: product } = await supabase.from('pos_products')
        .select('stock_quantity').eq('id', item.product_id).maybeSingle();
      if (!product) continue;
      await supabase.from('pos_products').update({
        stock_quantity: (product.stock_quantity || 0) + item.scanned_qty,
      }).eq('id', item.product_id).eq('business_id', bid);
    }
  }

  if (session.session_type === 'order') {
    // Create a manual purchase order draft
    const totalCostCents = items.reduce((s: number, i: any) =>
      s + ((i.scanned_qty || 0) * (i.unit_cost_cents || 0)), 0);
    const orderItems = items.map((i: any) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      barcode: i.barcode,
      sku: i.sku,
      current_stock: i.current_stock,
      suggested_qty: i.scanned_qty,
      manual_qty: null,
      unit_cost_cents: i.unit_cost_cents || 0,
      total_cost_cents: (i.scanned_qty || 0) * (i.unit_cost_cents || 0),
      reason: 'Scanned via mobile order builder',
    }));

    await supabase.from('purchase_order_drafts').insert({
      business_id: bid,
      draft_type: 'manual',
      status: 'draft',
      items: orderItems,
      total_cost_cents: totalCostCents,
      notes: notes || `Mobile scan order — ${new Date().toLocaleString('en-AU')}`,
      week_starting: new Date().toISOString().split('T')[0],
    });
  }

  // Mark session as completed
  await supabase.from('mobile_inventory_sessions').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    submitted_by: user.email,
    notes: notes || session.notes,
  }).eq('id', params.id);

  return NextResponse.json({ ok: true, type: session.session_type, items_processed: items.length });
}
