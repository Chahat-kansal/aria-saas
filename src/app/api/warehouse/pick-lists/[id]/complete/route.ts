export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: pickList } = await supabase.from('warehouse_pick_lists').select('*').eq('id', params.id).eq('business_id', business_id).single();
  if (!pickList) return NextResponse.json({ error: 'Pick list not found' }, { status: 404 });

  const items: Array<{ item_id: string; lot_id?: string; quantity_required: number; quantity_picked: number }> = pickList.items ?? [];

  // Deduct picked quantities from lots and update product stock
  let totalRequired = 0;
  let totalPicked = 0;

  for (const item of items) {
    totalRequired += item.quantity_required;
    totalPicked += item.quantity_picked;

    if (item.lot_id && item.quantity_picked > 0) {
      const { data: lot } = await supabase.from('warehouse_lots').select('quantity_remaining').eq('id', item.lot_id).maybeSingle();
      if (lot) {
        await supabase.from('warehouse_lots').update({
          quantity_remaining: Math.max(0, (lot.quantity_remaining ?? 0) - item.quantity_picked),
        }).eq('id', item.lot_id);
      }
    }
    if (item.item_id && item.quantity_picked > 0) {
      const { data: prod } = await supabase.from('pos_products').select('stock_quantity').eq('id', item.item_id).eq('business_id', business_id).maybeSingle();
      if (prod) {
        await supabase.from('pos_products').update({
          stock_quantity: Math.max(0, (prod.stock_quantity ?? 0) - item.quantity_picked),
        }).eq('id', item.item_id).eq('business_id', business_id);
      }
    }
  }

  const accuracy_pct = totalRequired > 0 ? Math.round((totalPicked / totalRequired) * 1000) / 10 : 100;

  const { data: updated, error } = await supabase.from('warehouse_pick_lists').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    accuracy_pct,
  }).eq('id', params.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pick_list: updated, accuracy_pct, shortfall: totalRequired - totalPicked });
}
