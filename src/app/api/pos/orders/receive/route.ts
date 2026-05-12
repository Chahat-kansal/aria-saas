export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { order_id, items } = await req.json();
  if (!order_id || !items?.length) return NextResponse.json({ error: 'order_id and items required' }, { status: 400 });

  // Verify business ownership
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
  let bid: string | null = active?.business_id ?? null;
  if (!bid) {
    const { data } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
    bid = data?.id ?? null;
  }
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  try {
    // Update stock for each received item
    for (const item of items) {
      if (!item.product_id || !item.received_qty) continue;
      const { data: product } = await supabase
        .from('pos_products')
        .select('stock_quantity')
        .eq('id', item.product_id)
        .eq('business_id', bid)
        .maybeSingle();
      if (product) {
        await supabase.from('pos_products').update({
          stock_quantity: (product.stock_quantity || 0) + item.received_qty,
        }).eq('id', item.product_id).eq('business_id', bid);
      }
    }

    // Update order status
    await supabase.from('pos_purchase_orders')
      .update({ status: 'received', received_at: new Date().toISOString() })
      .eq('id', order_id)
      .eq('business_id', bid);

    return NextResponse.json({ ok: true, items_received: items.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withErrorCapture('pos/orders/receive', _POST)
