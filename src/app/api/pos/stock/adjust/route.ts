export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'

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

  const { product_id, outlet_id, adjustment_qty, reason, adjusted_by, new_qty } = await req.json();
  if (!product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 });

  // BUGFIX-POS-4 FIX 3 — route through the CANONICAL per-outlet mover (items_on_hand via adjustOutletStock,
  // same rail the sale + staff-app adjust use) instead of only writing the demoted pos_products.stock_quantity
  // cache. set-to ('new_qty') computes delta from the real on-hand at the outlet; the attributed
  // pos_stock_adjustments row (outlet_id + adjusted_by) is now error-checked, not silently swallowed.
  const outletId = await resolveOutletId(supabaseAdmin, bid, outlet_id ?? null);

  let delta = parseFloat(adjustment_qty ?? '0') || 0;
  if (new_qty !== undefined) {
    let currentOnHand = 0;
    if (outletId) {
      const { data: inv } = await supabaseAdmin.from('pos_outlet_inventory').select('items_on_hand')
        .eq('business_id', bid).eq('product_id', product_id).eq('outlet_id', outletId).maybeSingle();
      currentOnHand = Number(inv?.items_on_hand ?? 0);
    }
    delta = parseFloat(new_qty) - currentOnHand;
  }

  // Canonical move (per-outlet source of truth).
  let newOnHand: number | null = null;
  if (outletId && delta !== 0) {
    newOnHand = await adjustOutletStock(supabaseAdmin, { businessId: bid, outletId, productId: product_id, delta });
  }

  // Keep pos_products.stock_quantity as a best-effort write-through cache (unchanged display behaviour).
  try {
    const { data: prod } = await supabase.from('pos_products').select('stock_quantity').eq('id', product_id).maybeSingle();
    const cacheVal = new_qty !== undefined ? parseFloat(new_qty) : Math.max(0, (Number(prod?.stock_quantity) || 0) + delta);
    await supabase.from('pos_products').update({ stock_quantity: cacheVal }).eq('id', product_id);
  } catch { /* cache best-effort */ }

  // Attributed audit row — now error-checked (was a swallowed try/catch).
  const { error: adjErr } = await supabaseAdmin.from('pos_stock_adjustments').insert({
    business_id: bid,
    product_id,
    outlet_id: outletId,
    adjustment_qty: delta,
    reason: reason ?? null,
    adjusted_by: adjusted_by ?? null,
  });
  if (adjErr) console.error('[pos/stock/adjust] adjustment audit insert failed:', adjErr.message);

  return NextResponse.json({ ok: true, delta, new_on_hand: newOnHand });
}

export const POST = withErrorCapture('pos/stock/adjust', _POST)
