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

  // Fetch primary outlet once (reused across all items)
  const { data: outlet } = await supabase
    .from('pos_outlets').select('id').eq('business_id', bid).limit(1).maybeSingle();

  try {
    for (const item of items as Array<{
      line_id?: string; product_id: string; received_qty: number;
      expiry_date?: string | null; quantity_ordered?: number;
    }>) {
      if (!item.product_id || !item.received_qty) continue;

      // 1. Update pos_products.stock_quantity
      const { data: prod } = await supabase.from('pos_products')
        .select('stock_quantity').eq('id', item.product_id).eq('business_id', bid).maybeSingle();
      if (prod) {
        await supabase.from('pos_products')
          .update({ stock_quantity: (prod.stock_quantity || 0) + item.received_qty })
          .eq('id', item.product_id).eq('business_id', bid);
      }

      // 2. Update pos_outlet_inventory.items_on_hand
      if (outlet) {
        const { data: inv } = await supabase.from('pos_outlet_inventory')
          .select('id, items_on_hand')
          .eq('product_id', item.product_id).eq('outlet_id', outlet.id).maybeSingle();
        if (inv) {
          await supabase.from('pos_outlet_inventory')
            .update({ items_on_hand: (inv.items_on_hand || 0) + item.received_qty, updated_at: new Date().toISOString() })
            .eq('id', inv.id);
        } else {
          await supabase.from('pos_outlet_inventory').insert({
            business_id: bid, outlet_id: outlet.id, product_id: item.product_id,
            items_on_hand: item.received_qty, items_reorder_level: 5,
            items_reorder_amount: 10, updated_at: new Date().toISOString(),
          });
        }
      }

      // 3. Update pos_purchase_order_items.quantity_received + receive_status
      if (item.line_id) {
        const ordered = item.quantity_ordered ?? item.received_qty;
        const receiveStatus = item.received_qty >= ordered ? 'received'
          : item.received_qty > 0 ? 'partial' : 'not_received';
        await supabase.from('pos_purchase_order_items')
          .update({ quantity_received: item.received_qty, receive_status: receiveStatus, received_at: new Date().toISOString() })
          .eq('id', item.line_id);
      }

      // 4. Create pos_product_batches if expiry_date provided
      if (item.expiry_date) {
        const { data: batch } = await supabase.from('pos_product_batches').insert({
          business_id: bid,
          outlet_id: outlet?.id ?? null,
          product_id: item.product_id,
          purchase_order_id: order_id,
          purchase_order_item_id: item.line_id ?? null,
          quantity_received: item.received_qty,
          quantity_remaining: item.received_qty,
          expiry_date: item.expiry_date,
          expiry_tracked: true,
          source: 'purchase_order',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).select('id').single();

        // 5. Create pos_expiry_alerts if expiry within 60 days
        const daysUntil = Math.ceil(
          (new Date(item.expiry_date).getTime() - Date.now()) / 86400000
        );
        if (daysUntil > 0 && daysUntil <= 60) {
          const alertType = daysUntil <= 7 ? 'critical'
            : daysUntil <= 14 ? 'expiring_soon'
            : daysUntil <= 30 ? 'expiring_this_month' : 'expiring_in_60_days';
          await supabase.from('pos_expiry_alerts').insert({
            business_id: bid,
            batch_id: batch?.id ?? null,
            product_id: item.product_id,
            alert_type: alertType,
            days_until_expiry: daysUntil,
            quantity_at_risk: item.received_qty,
            message: `Stock expiring in ${daysUntil} days — ${item.received_qty} units at risk`,
            acknowledged: false,
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    // Mark order as received
    await supabase.from('pos_purchase_orders')
      .update({ status: 'received', received_at: new Date().toISOString() })
      .eq('id', order_id).eq('business_id', bid);

    return NextResponse.json({ ok: true, items_received: items.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orders/receive]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withErrorCapture('pos/orders/receive', _POST)
