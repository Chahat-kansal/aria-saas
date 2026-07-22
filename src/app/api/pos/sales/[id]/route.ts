export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { logSaleEdit } from '@/lib/pos/sale-audit';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { reverseEarnOnSale } from '@/lib/loyalty/reverseEarnOnSale';
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { recordSaleMovements, VOID_MOVEMENT_TYPE, type SaleMovementLine } from '@/lib/inventory/record-sale-movement'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

const EDITABLE_METADATA = [
  'served_by', 'register_id', 'outlet_id', 'customer_id',
  'internal_comment', 'external_notes', 'notes',
] as const;

const BLOCKED_FIELDS = [
  'payment_method', 'total_amount', 'subtotal', 'tax_amount',
  'created_at', 'sale_number', 'business_id', 'session_id', 'status',
] as const;

const UUID_FIELDS = new Set(['register_id', 'outlet_id', 'customer_id']);

async function _GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const action = new URL(req.url).searchParams.get('action');

  if (action === 'audit') {
    const { data: edits } = await supabase
      .from('pos_sale_edits')
      .select('*')
      .eq('sale_id', params.id)
      .eq('business_id', bid)
      .order('created_at', { ascending: false })
      .limit(100);
    return NextResponse.json({ edits: edits ?? [] });
  }

  const { data: sale } = await supabase
    .from('pos_sales')
    .select('*, pos_customers(id, name, email, phone, loyalty_points), pos_sale_items(id, product_id, product_name, product_sku, quantity, unit_price, discount_percent, line_total, tax_rate, cost_price, margin_percent, returned_quantity)')
    .eq('id', params.id)
    .eq('business_id', bid)
    .maybeSingle();

  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
  return NextResponse.json({ sale });
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 });

  const action = new URL(req.url).searchParams.get('action') ?? 'modify_metadata';
  const body = await req.json();
  const saleId = params.id;

  // Fetch existing sale for comparison + auth
  const { data: existing } = await supabase
    .from('pos_sales')
    .select('*')
    .eq('id', saleId)
    .eq('business_id', bid)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'sale_not_found' }, { status: 404 });

  // ── void ─────────────────────────────────────────────────────────
  if (action === 'void') {
    if (existing.status === 'voided') {
      return NextResponse.json({ error: 'already_voided' }, { status: 400 });
    }

    const { data: items } = await supabase
      .from('pos_sale_items')
      .select('product_id, quantity')
      .eq('sale_id', saleId);

    // INV-DECREMENT-FIX — was routed through reverse_outlet_inventory, which referenced
    // pos_outlet_inventory.on_hand (real column: items_on_hand) and stock_movements columns that
    // don't exist; every call threw, was caught by this route's own try/catch, and NEVER actually
    // restored stock. Rerouted onto the same proven adjustOutletStock()/resolveOutletId() pair
    // pos/sales/[id]/void/route.ts uses, plus a movement row so the restore isn't silent either.
    const voidOutletId = await resolveOutletId(supabase, bid, existing.outlet_id ?? null);
    const voidMovementLines: SaleMovementLine[] = [];
    for (const item of (items ?? [])) {
      if (!item.product_id) continue;
      const { data: prod } = await supabase
        .from('pos_products').select('track_stock').eq('id', item.product_id).maybeSingle();
      if (!prod?.track_stock) continue;
      try {
        await supabase.rpc('increment_numeric', { p_table: 'pos_products', p_id: item.product_id, p_column: 'stock_quantity', p_amount: item.quantity }); // cache
        const itemsOnHand = await adjustOutletStock(supabase, { businessId: bid, outletId: voidOutletId, productId: item.product_id, delta: Math.abs(Number(item.quantity)) }); // canonical
        voidMovementLines.push({ itemId: item.product_id, quantitySold: Number(item.quantity), newStock: itemsOnHand });
      } catch (err) {
        console.warn('[void] inventory reverse failed:', err);
      }
    }
    await recordSaleMovements(supabase, {
      businessId: bid, saleId: saleId, saleNumber: (existing as { sale_number?: string | null }).sale_number ?? null,
      lines: voidMovementLines, movementType: VOID_MOVEMENT_TYPE, outletId: voidOutletId, writtenBy: 'pos/sales/[id]:action=void',
    });

    await supabase.from('pos_sales').update({
      status: 'voided',
      last_edited_at: new Date().toISOString(),
      last_edited_by: user.id,
    }).eq('id', saleId);

    // LOYALTY-FINISH — reverse any loyalty points earned on this sale. Never
    // blocks the void itself; a reversal failure is logged, not fatal.
    try {
      await reverseEarnOnSale({ businessId: bid, saleId, totalAmount: Number(existing.total_amount ?? 0) });
    } catch (e) { console.error('[pos/sales/[id] void] loyalty reversal failed:', (e as Error).message); }

    await logSaleEdit(supabase, {
      sale_id: saleId, business_id: bid, edited_by: user.id,
      action: 'void',
      old_value: { status: existing.status },
      new_value: { status: 'voided' },
      reason: body.reason,
    });

    return NextResponse.json({ ok: true });
  }

  // ── add_comment ───────────────────────────────────────────────────
  if (action === 'add_comment') {
    await logSaleEdit(supabase, {
      sale_id: saleId, business_id: bid, edited_by: user.id,
      action: 'comment',
      new_value: body.comment,
      reason: body.reason,
    });
    return NextResponse.json({ ok: true });
  }

  // ── modify_metadata ───────────────────────────────────────────────
  const blocked = Object.keys(body).filter(k => BLOCKED_FIELDS.includes(k as never));
  if (blocked.includes('payment_method')) {
    return NextResponse.json({
      error: 'tender_change_blocked',
      message: 'Tender type cannot be changed. Void the sale and re-ring with the correct tender.',
    }, { status: 400 });
  }
  if (blocked.length > 0) {
    return NextResponse.json({
      error: 'fields_not_editable',
      message: `These fields cannot be edited: ${blocked.join(', ')}`,
    }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {
    last_edited_at: new Date().toISOString(),
    last_edited_by: user.id,
  };
  const changes: { field: string; old: unknown; new: unknown }[] = [];

  for (const field of EDITABLE_METADATA) {
    if (!(field in body)) continue;
    const rawVal = body[field];
    const newVal = UUID_FIELDS.has(field) ? (rawVal === '' ? null : rawVal) : rawVal;
    const oldVal = (existing as Record<string, unknown>)[field];
    if (newVal !== oldVal) {
      updatePayload[field] = newVal;
      changes.push({ field, old: oldVal, new: newVal });
    }
  }

  if (changes.length === 0) return NextResponse.json({ ok: true, message: 'no_changes' });

  const { error: updErr } = await supabase
    .from('pos_sales').update(updatePayload).eq('id', saleId).eq('business_id', bid);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  for (const change of changes) {
    await logSaleEdit(supabase, {
      sale_id: saleId, business_id: bid, edited_by: user.id,
      action: 'modify_metadata',
      field_changed: change.field,
      old_value: change.old,
      new_value: change.new,
    });
  }

  return NextResponse.json({ ok: true, changes: changes.length });
}

export const GET = withErrorCapture('pos/sales/[id]', _GET)
export const PATCH = withErrorCapture('pos/sales/[id]', _PATCH)
