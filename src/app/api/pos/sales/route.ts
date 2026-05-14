export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ sales: [] });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const session_id = searchParams.get('session_id');

  let query = supabase
    .from('pos_sales')
    .select('*, pos_customers(name), pos_sale_items(quantity, unit_price, discount_amount, pos_products(name))')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (session_id) query = query.eq('session_id', session_id);

  const { data: sales, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sales: sales || [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const {
    items,
    total_amount,
    payment_method,
    customer_id,
    discount_amount,
    served_by,
    notes,
    // Gift card fields
    gift_card_code,
    gift_card_amount,
    // Split payment: [{method, amount}]
    split_payments,
    // Direct deposit
    direct_deposit_ref,
    // Optional — client can pass these; if missing, we look them up
    outlet_id: requestOutletId,
    register_id: requestRegisterId,
  } = await req.json();

  if (!items?.length) return NextResponse.json({ error: 'No items provided' }, { status: 400 });

  // Normalise payment method label
  const GIFT_CARD_METHODS = ['gift_card', 'aria_gift_card', 'visa_gift_card', 'mastercard_gift_card'];
  const isGiftCard = GIFT_CARD_METHODS.includes(payment_method) || !!gift_card_code;
  const isDirectDeposit = ['direct_deposit', 'bank_transfer'].includes(payment_method);
  const isCash = payment_method === 'cash';
  const isSplit = payment_method === 'split' || (split_payments?.length > 1);

  // If paying by Aria gift card, validate it first before creating the sale
  let validatedGiftCard: { id: string; current_balance: number } | null = null;
  if (isGiftCard && gift_card_code) {
    const code = String(gift_card_code).toUpperCase().trim();
    const { data: gc, error: gcErr } = await supabase
      .from('pos_gift_cards')
      .select('id, current_balance, is_active, status, expires_at')
      .eq('business_id', bid)
      .eq('code', code)
      .maybeSingle();

    if (gcErr?.code !== '42P01') { // ignore if table missing
      if (!gc) return NextResponse.json({ error: 'Gift card not found' }, { status: 400 });
      if (!gc.is_active || gc.status === 'cancelled') return NextResponse.json({ error: 'Gift card is cancelled' }, { status: 400 });
      if (gc.expires_at && new Date(gc.expires_at) < new Date()) return NextResponse.json({ error: 'Gift card has expired' }, { status: 400 });
      if ((gc.current_balance ?? 0) <= 0) return NextResponse.json({ error: 'Gift card has no remaining balance' }, { status: 400 });
      validatedGiftCard = gc;
    }
  }

  const { data: openSession } = await supabase
    .from('pos_cash_sessions')
    .select('id, total_cash_sales, total_card_sales')
    .eq('business_id', bid)
    .is('closed_at', null)
    .maybeSingle();

  // Resolve outlet_id + register_id — use request values, else look up first active ones
  let resolvedOutletId: string | null = requestOutletId ?? null;
  let resolvedRegisterId: string | null = requestRegisterId ?? null;
  if (!resolvedOutletId) {
    const { data: firstOutlet } = await supabase.from('pos_outlets').select('id').eq('business_id', bid).limit(1).maybeSingle();
    resolvedOutletId = firstOutlet?.id ?? null;
  }
  if (!resolvedRegisterId && resolvedOutletId) {
    const { data: firstReg } = await supabase.from('pos_registers').select('id').eq('outlet_id', resolvedOutletId).eq('is_active', true).limit(1).maybeSingle();
    resolvedRegisterId = firstReg?.id ?? null;
  }

  // Build sale insert — include new columns if they exist
  const salePayload: Record<string, unknown> = {
    business_id: bid,
    session_id: openSession?.id ?? null,
    customer_id: customer_id ?? null,
    total_amount,
    discount_amount: discount_amount ?? 0,
    payment_method,
    status: 'completed',
  };

  // Add optional columns (safe — if column doesn't exist yet Supabase ignores unknown keys
  // but will error on schema mismatch; these are added by migration 20260506000003)
  if (served_by !== undefined) salePayload.served_by = served_by;
  if (notes !== undefined) salePayload.notes = notes;
  if (resolvedOutletId) salePayload.outlet_id = resolvedOutletId;
  if (resolvedRegisterId) salePayload.register_id = resolvedRegisterId;
  if (direct_deposit_ref) salePayload.direct_deposit_ref = direct_deposit_ref;
  if (isSplit && split_payments?.length) salePayload.split_payments = split_payments;
  if (gift_card_code) {
    salePayload.gift_card_code = String(gift_card_code).toUpperCase().trim();
    salePayload.gift_card_amount = gift_card_amount ?? 0;
    if (validatedGiftCard) salePayload.gift_card_id = validatedGiftCard.id;
  }

  const { data: sale, error: saleError } = await supabase
    .from('pos_sales')
    .insert(salePayload)
    .select()
    .single();

  if (saleError) return NextResponse.json({ error: saleError.message }, { status: 500 });

  const { error: itemsError } = await supabase.from('pos_sale_items').insert(
    items.map((i: any) => ({
      sale_id: sale.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount_amount: i.discount_amount ?? 0,
    }))
  );

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  // Deduct from gift card balance
  if (validatedGiftCard && gift_card_amount) {
    const charge = parseFloat(String(gift_card_amount));
    const newBalance = Math.max(0, (validatedGiftCard.current_balance ?? 0) - charge);
    await supabase.from('pos_gift_cards').update({
      current_balance: newBalance,
      status: newBalance <= 0 ? 'used' : 'active',
      last_used_at: new Date().toISOString(),
    }).eq('id', validatedGiftCard.id);
  }

  // Update session totals
  if (openSession) {
    await supabase.from('pos_cash_sessions').update({
      total_cash_sales: (openSession.total_cash_sales || 0) + (isCash ? total_amount : 0),
      total_card_sales: (openSession.total_card_sales || 0) + (!isCash && !isGiftCard && !isDirectDeposit ? total_amount : 0),
    }).eq('id', openSession.id);
  }

  // Loyalty points
  if (customer_id) {
    const pts = Math.floor(total_amount);
    await supabase.rpc('increment_loyalty_points', { customer_id, points: pts }).maybeSingle();
  }

  // ── Save payment record(s) — amount_cents is CENTS not dollars ──────────────
  try {
    const paymentsToInsert: Array<{ sale_id: string; method: string; amount_cents: number; reference?: string | null }> = [];
    if (isSplit && Array.isArray(split_payments) && split_payments.length > 0) {
      for (const sp of split_payments as Array<{ method: string; amount: number }>) {
        paymentsToInsert.push({ sale_id: sale.id, method: sp.method, amount_cents: Math.round((sp.amount ?? 0) * 100) });
      }
    } else {
      paymentsToInsert.push({
        sale_id: sale.id,
        method: payment_method,
        amount_cents: Math.round((total_amount ?? 0) * 100),
        reference: direct_deposit_ref ?? null,
      });
    }
    if (paymentsToInsert.length > 0) {
      await supabase.from('pos_sale_payments').insert(paymentsToInsert);
    }
  } catch (payErr) {
    console.error('[pos/sales] payment save failed (non-fatal):', (payErr as Error).message);
  }

  // ── Decrement stock — pos_products.stock_quantity + pos_outlet_inventory.items_on_hand ──
  try {
    for (const item of (items as Array<{ product_id: string; quantity: number }>) ?? []) {
      // pos_products.stock_quantity
      const { data: prod } = await supabase.from('pos_products')
        .select('stock_quantity').eq('id', item.product_id).maybeSingle();
      if (prod?.stock_quantity != null) {
        await supabase.from('pos_products')
          .update({ stock_quantity: Math.max(0, prod.stock_quantity - item.quantity) })
          .eq('id', item.product_id);
      }

      // pos_outlet_inventory.items_on_hand (source of truth)
      if (resolvedOutletId) {
        const { data: inv } = await supabase.from('pos_outlet_inventory')
          .select('id, items_on_hand')
          .eq('product_id', item.product_id)
          .eq('outlet_id', resolvedOutletId)
          .maybeSingle();
        if (inv) {
          await supabase.from('pos_outlet_inventory')
            .update({ items_on_hand: Math.max(0, (inv.items_on_hand ?? 0) - item.quantity), updated_at: new Date().toISOString() })
            .eq('id', inv.id);
        }
      }
    }
  } catch (stockErr) {
    console.error('[pos/sales] stock decrement failed (non-fatal):', (stockErr as Error).message);
  }

  return NextResponse.json({ sale });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined)       allowed.status = body.status;
  if (body.served_by !== undefined)    allowed.served_by = body.served_by;
  if (body.notes !== undefined)        allowed.notes = body.notes;
  if (body.customer_id !== undefined)  allowed.customer_id = body.customer_id;

  const { error } = await supabase
    .from('pos_sales')
    .update(allowed)
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/sales', _GET)
export const POST = withErrorCapture('pos/sales', _POST)
export const PATCH = withErrorCapture('pos/sales', _PATCH)
