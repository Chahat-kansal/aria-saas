export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

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

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ sales: [] });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');

  const { data: sales, error } = await supabase
    .from('pos_sales')
    .select('*, pos_customers(name), pos_sale_items(quantity, unit_price, discount_amount, pos_products(name))')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sales: sales || [] });
}

export async function POST(req: Request) {
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

  return NextResponse.json({ sale });
}

export async function PATCH(req: Request) {
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
