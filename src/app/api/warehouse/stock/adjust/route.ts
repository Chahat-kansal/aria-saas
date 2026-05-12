export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, item_id, new_quantity, reason } = await req.json();
  if (!business_id || !item_id || new_quantity === undefined) {
    return NextResponse.json({ error: 'business_id, item_id, new_quantity required' }, { status: 400 });
  }
  if (new_quantity < 0) {
    return NextResponse.json({ error: 'new_quantity must be >= 0' }, { status: 400 });
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: prod } = await supabase
    .from('pos_products')
    .select('stock_quantity')
    .eq('id', item_id)
    .eq('business_id', business_id)
    .single();
  if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const old_quantity = prod.stock_quantity ?? 0;
  const variance = new_quantity - old_quantity;

  const { error: updateErr } = await supabase
    .from('pos_products')
    .update({ stock_quantity: new_quantity })
    .eq('id', item_id)
    .eq('business_id', business_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  if (variance !== 0) {
    await supabase.from('stock_movements').insert({
      business_id,
      item_id,
      movement_type: 'manual_adjustment',
      quantity_added: variance,
      new_stock: new_quantity,
      notes: reason ?? 'Manual stock adjustment',
    }).then(() => null, () => null);
  }

  return NextResponse.json({ ok: true, new_stock: new_quantity, variance });
}

export const POST = withErrorCapture('warehouse/stock/adjust', _POST)
