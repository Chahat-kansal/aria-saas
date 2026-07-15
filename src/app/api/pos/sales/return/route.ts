export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { logSaleEdit } from '@/lib/pos/sale-audit';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const { sale_id, items, reason } = await req.json();
  if (!sale_id || !items?.length) return NextResponse.json({ error: 'sale_id and items required' }, { status: 400 });

  const { data: orig } = await supabase.from('pos_sales').select('*').eq('id', sale_id).eq('business_id', bid).maybeSingle();
  if (!orig) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });

  // SECURITY-CRITICAL-1 — sale_id above is already verified to belong to bid; scoping this query by
  // that SAME sale_id (not just the client-supplied item ids) is what stops a caller from supplying
  // another tenant's sale_item_id and having it accepted as if it belonged to their own verified sale.
  // Without this, claim_return_qty (business-id-blind, id-only) would mutate a foreign tenant's real
  // sale-item row and this route would fabricate a refund from it (BUG-HUNT-1 Tier 0.2).
  const itemIds = items.map((i: { sale_item_id: string }) => i.sale_item_id);
  const { data: origItems } = await supabase.from('pos_sale_items').select('*').eq('sale_id', sale_id).in('id', itemIds);
  if (!origItems?.length) return NextResponse.json({ error: 'Items not found' }, { status: 404 });

  // BUGFIX-POS-RACES-5 FIX 3 — atomically claim the returnable quantity on each original line BEFORE refunding.
  // claim_return_qty only succeeds while returned_quantity + qty <= quantity (the guard is checked under the
  // row lock), so over-returning (more than was sold, or two concurrent returns of the same line) is impossible.
  // All-or-nothing: if any line exceeds remaining, release the lines already claimed in this request and reject.
  type Orig = (typeof origItems)[number];
  const claimedLines: Array<{ oi: Orig; qty: number }> = [];
  for (const oi of origItems) {
    const reqItem = items.find((i: { sale_item_id: string; qty?: number }) => i.sale_item_id === oi.id);
    if (!reqItem) continue;
    const qty = Number(reqItem.qty ?? oi.quantity) || 0;
    if (qty <= 0) continue;
    const { data: newRet, error: claimErr } = await supabase.rpc('claim_return_qty', { p_item_id: oi.id, p_qty: qty });
    if (claimErr || newRet == null) {
      for (const c of claimedLines) await supabase.rpc('claim_return_qty', { p_item_id: c.oi.id, p_qty: -c.qty });
      return NextResponse.json({ error: `Return exceeds the remaining returnable quantity for ${oi.product_name ?? 'an item'}` }, { status: 409 });
    }
    claimedLines.push({ oi, qty });
  }
  if (claimedLines.length === 0) return NextResponse.json({ error: 'No returnable items' }, { status: 400 });

  let refundTotal = 0;
  const refundItems = claimedLines.map(({ oi, qty }) => {
    const lineTotal = -(oi.unit_price ?? 0) * qty;
    refundTotal += lineTotal;
    return { ...oi, id: undefined, quantity: -qty, line_total: lineTotal };
  });

  const { count } = await supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid);
  const saleNumber = `REF-${String((count ?? 0) + 1).padStart(4, '0')}`;

  const { data: refundSale, error } = await supabase.from('pos_sales').insert({
    business_id: bid,
    sale_number: saleNumber,
    payment_method: orig.payment_method ?? 'card',
    total_amount: refundTotal,
    subtotal: refundTotal,
    tax_amount: refundTotal - refundTotal / 1.1,
    discount_amount: 0,
    status: 'refunded',
    original_sale_id: sale_id,
    notes: reason ? `Return: ${reason}` : `Return of ${orig.sale_number}`,
  }).select().single();

  if (error || !refundSale) {
    // Release the returned_quantity claims so a failed refund-sale insert doesn't leave items marked returned.
    for (const c of claimedLines) await supabase.rpc('claim_return_qty', { p_item_id: c.oi.id, p_qty: -c.qty });
    return NextResponse.json({ error: error?.message ?? 'Return could not be recorded' }, { status: 500 });
  }

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

  // Restore inventory via RPC (replaces direct pos_products update)
  for (const ri of refundItems) {
    if (!ri.product_id) continue;
    const { data: prod } = await supabase.from('pos_products').select('track_stock').eq('id', ri.product_id).maybeSingle();
    if (!prod?.track_stock) continue;
    try {
      await supabase.rpc('reverse_outlet_inventory', {
        p_product_id: ri.product_id,
        p_outlet_id: orig.outlet_id ?? null,
        p_quantity: Math.abs(ri.quantity),
        p_business_id: bid,
        p_reason: `return:${sale_id}`,
      });
    } catch (err) {
      console.warn('[return] inventory reverse failed:', err);
    }
  }

  await logSaleEdit(supabase, {
    sale_id,
    business_id: bid,
    edited_by: user.id,
    action: 'return',
    new_value: {
      return_sale_id: refundSale.id,
      items: refundItems.map(i => ({ product_id: i.product_id, qty: i.quantity })),
    },
    reason,
  });

  return NextResponse.json({ refund_sale: refundSale, total: refundTotal });
}

export const POST = withErrorCapture('pos/sales/return', _POST)
