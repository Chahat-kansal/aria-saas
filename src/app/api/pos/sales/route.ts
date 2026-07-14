export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { createSale } from '@/lib/pos/create-sale'

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
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 2000);
  const session_id = searchParams.get('session_id');
  const since = searchParams.get('since');
  const q = searchParams.get('q');

  let query = supabase
    .from('pos_sales')
    .select('*, pos_customers(name), pos_sale_items(quantity, unit_price, pos_products(name))')
    .eq('business_id', bid)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (session_id) query = query.eq('session_id', session_id);
  if (since) query = query.gte('created_at', since);
  if (q) query = query.or(`sale_number.ilike.%${q}%,served_by.ilike.%${q}%`);

  const { data: sales, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sales: sales || [] });
}

// POS-SALE-CONSOLIDATE-1 — this handler used to be a full second, independently-maintained copy
// of sale creation (its own sale+items inserts, its own stock decrement, its own inline KDS-ticket
// block, no compensating void on a failed item insert). Confirmed via a live-caller audit that this
// POST has zero real callers today (client or server) — but it's the one route with gift-card,
// arbitrary split-payment, and direct-deposit support that pos/sale doesn't have, so it's kept (not
// deleted, RULE0) and redirected onto the shared createSale() service instead of carrying its own
// copy of the same logic. Every caller — present or future — now gets the full, consistent set of
// downstream effects (loyalty's full LOY-* hook set, the canonical fireKdsTickets, the
// compensating void-on-item-insert-failure) instead of the smaller subset this route used to have.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
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
    // KDS / order context
    table_label,
    order_notes,
  } = body;

  if (!items?.length) return NextResponse.json({ error: 'No items provided' }, { status: 400 });

  // If paying by Aria gift card, validate it first before creating the sale — unchanged behaviour.
  let validatedGiftCard: { id: string; balance: number } | null = null;
  const GIFT_CARD_METHODS = ['gift_card', 'aria_gift_card', 'visa_gift_card', 'mastercard_gift_card'];
  const isGiftCard = GIFT_CARD_METHODS.includes(payment_method) || !!gift_card_code;
  if (isGiftCard && gift_card_code) {
    const code = String(gift_card_code).toUpperCase().trim();
    const { data: gc, error: gcErr } = await supabase
      .from('pos_gift_cards')
      .select('id, balance, is_active, status, expires_at')
      .eq('business_id', bid)
      .eq('code', code)
      .maybeSingle();

    if (gcErr?.code !== '42P01') { // ignore if table missing
      if (!gc) return NextResponse.json({ error: 'Gift card not found' }, { status: 400 });
      if (!gc.is_active || gc.status === 'cancelled') return NextResponse.json({ error: 'Gift card is cancelled' }, { status: 400 });
      if (gc.expires_at && new Date(gc.expires_at) < new Date()) return NextResponse.json({ error: 'Gift card has expired' }, { status: 400 });
      if ((gc.balance ?? 0) <= 0) return NextResponse.json({ error: 'Gift card has no remaining balance' }, { status: 400 });
      validatedGiftCard = gc;
    }
  }

  // Resolve outlet_id + register_id — use request values, else look up first active ones
  // (unchanged behaviour: this route, unlike pos/sale, always fills a fallback outlet on the row).
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

  const result = await createSale(supabase, {
    businessId: bid,
    userId: user.id,
    items: (items as Array<Record<string, unknown>>).map(i => ({
      product_id: (i.product_id as string) ?? '',
      product_name: (i.product_name as string) ?? (i.name as string) ?? 'Unknown',
      product_sku: (i.sku as string) ?? null,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      discount_percent: Number(i.discount_percent) || 0,
      line_total: Math.round((Number(i.unit_price) * Number(i.quantity) - Number(i.discount_amount ?? 0)) * 100) / 100,
      cost_price: (i.cost_price as number) ?? null,
    })),
    customerId: customer_id,
    paymentMethod: payment_method,
    subtotal: (items as Array<{ unit_price: number; quantity: number }>).reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0),
    discountAmount: discount_amount ?? 0,
    totalAmount: total_amount,
    notes: order_notes ?? notes ?? null,
    servedBy: served_by,
    splitPayments: split_payments,
    outletId: resolvedOutletId,
    registerId: resolvedRegisterId,
    tableLabel: table_label ?? null,
    giftCard: gift_card_code ? { id: validatedGiftCard?.id ?? null, code: gift_card_code, amount: gift_card_amount ?? 0 } : null,
    directDepositRef: direct_deposit_ref,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  const sale = result.sale as { id: string }

  // Deduct from gift card balance — unchanged, route-specific (not part of the shared service since
  // it mutates a different domain object, not the sale itself).
  if (validatedGiftCard && gift_card_amount) {
    const charge = parseFloat(String(gift_card_amount));
    const newBalance = Math.max(0, (validatedGiftCard.balance ?? 0) - charge);
    await supabase.from('pos_gift_cards').update({
      balance: newBalance,
      status: newBalance <= 0 ? 'used' : 'active',
    }).eq('id', validatedGiftCard.id);
  }

  // Auto-request Google review SMS (fire-and-forget, respects business settings + cooldown) —
  // unchanged, route-specific extra that pos/sale never had; kept here rather than folded into the
  // shared service so migrating pos/sale to createSale() doesn't silently add a new customer SMS
  // trigger to the terminal checkout flow.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ariaos.site'
  fetch(`${baseUrl}/api/reviews/auto-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sale_id: sale.id, business_id: bid }),
  }).catch(() => {});

  return NextResponse.json({ sale: result.sale });
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
