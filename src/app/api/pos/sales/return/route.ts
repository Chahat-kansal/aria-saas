export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { sale_id, items, reason } = await req.json();
  if (!sale_id || !items?.length) return NextResponse.json({ error: 'sale_id and items required' }, { status: 400 });

  // Fetch original sale
  const { data: orig } = await supabase.from('pos_sales').select('*').eq('id', sale_id).eq('business_id', bid).maybeSingle();
  if (!orig) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });

  // Fetch selected items
  const itemIds = items.map((i: { sale_item_id: string }) => i.sale_item_id);
  const { data: origItems } = await supabase.from('pos_sale_items').select('*').in('id', itemIds);
  if (!origItems?.length) return NextResponse.json({ error: 'Items not found' }, { status: 404 });

  // Build refund total
  let refundTotal = 0;
  const refundItems = origItems.map(oi => {
    const reqItem = items.find((i: { sale_item_id: string; qty: number }) => i.sale_item_id === oi.id);
    const qty = reqItem?.qty ?? oi.quantity;
    const lineTotal = -(oi.unit_price ?? 0) * qty;
    refundTotal += lineTotal;
    return { ...oi, id: undefined, quantity: -qty, line_total: lineTotal };
  });

  // Count existing returns for number
  const { count } = await supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid);
  const saleNumber = `REF-${String((count ?? 0) + 1).padStart(4, '0')}`;

  // Create refund sale
  const { data: refundSale, error } = await supabase.from('pos_sales').insert({
    business_id: bid,
    sale_number: saleNumber,
    payment_method: orig.payment_method ?? 'card',
    total_amount: refundTotal,
    subtotal: refundTotal,
    tax_amount: refundTotal - refundTotal / 1.1,
    discount_amount: 0,
    status: 'refunded',
    notes: reason ? `Return: ${reason}` : `Return of ${orig.sale_number}`,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert refund items
  const refundItemsInsert = refundItems.map(ri => ({
    sale_id: refundSale.id,
    product_id: ri.product_id,
    product_name: ri.product_name,
    quantity: ri.quantity,
    unit_price: ri.unit_price,
    line_total: ri.line_total,
    tax_rate: ri.tax_rate ?? 10,
    discount_percent: 0,
  }));
  await supabase.from('pos_sale_items').insert(refundItemsInsert);

  // Restore inventory
  for (const ri of refundItems) {
    if (!ri.product_id) continue;
    const { data: prod } = await supabase.from('pos_products').select('stock_quantity, track_stock').eq('id', ri.product_id).maybeSingle();
    if (prod?.track_stock) {
      const returnQty = Math.abs(ri.quantity);
      await supabase.from('pos_products').update({ stock_quantity: (prod.stock_quantity ?? 0) + returnQty }).eq('id', ri.product_id);
    }
  }

  return NextResponse.json({ refund_sale: refundSale, total: refundTotal });
}
