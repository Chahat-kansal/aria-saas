export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { canTransition, requiredPermissionForTransition, snapshotUnitCost, computeVariance, type TransferStatus, type CostMethod } from '@/lib/pos/transfer-engine';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

type Params = { params: Promise<{ id: string }> }

async function _POST(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { to_status, item_updates, cancellation_reason, pos_user_id } = await req.json() as {
    to_status: TransferStatus;
    item_updates?: Array<{ id: string; quantity_approved?: number; quantity_sent?: number; quantity_received?: number; variance_reason?: string; variance_note?: string }>;
    cancellation_reason?: string;
    pos_user_id?: string;
  };

  const { data: transfer } = await supabase.from('pos_inventory_transfers').select('*').eq('id', id).eq('business_id', bid).maybeSingle();
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const from = transfer.status as TransferStatus;
  if (!canTransition(from, to_status)) {
    return NextResponse.json({ error: `Cannot transition ${from} → ${to_status}` }, { status: 400 });
  }

  const requiredFlag = requiredPermissionForTransition(from, to_status);
  if (requiredFlag && pos_user_id) {
    const { data: posUser } = await supabase.from('pos_users').select('permissions').eq('id', pos_user_id).maybeSingle();
    const perms = (posUser?.permissions as Record<string, unknown>) ?? {};
    if (perms[requiredFlag] !== true) {
      return NextResponse.json({ error: `Missing permission: ${requiredFlag}` }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status: to_status };

  if (to_status === 'approved')    { updates.approved_by = user.id;    updates.approved_at = now; }
  if (to_status === 'in_transit')  { updates.shipped_by = user.id;     updates.shipped_at = now; }
  if (to_status === 'received')    { updates.received_by = user.id;    updates.received_at = now; }
  if (to_status === 'reconciled')  { updates.reconciled_by = user.id;  updates.reconciled_at = now; updates.completed_at = now; }
  if (to_status === 'cancelled')   { updates.cancellation_reason = cancellation_reason ?? null; updates.completed_at = now; }

  if (item_updates?.length) {
    for (const u of item_updates) {
      const patch: Record<string, unknown> = {};
      if (u.quantity_approved !== undefined) patch.quantity_approved = Number(u.quantity_approved) || 0;
      if (u.quantity_sent !== undefined)     patch.quantity_sent = Number(u.quantity_sent) || 0;
      if (u.quantity_received !== undefined) patch.quantity_received = Number(u.quantity_received) || 0;
      if (u.variance_reason !== undefined)   patch.variance_reason = u.variance_reason || null;
      if (u.variance_note !== undefined)     patch.variance_note = u.variance_note || null;
      if (Object.keys(patch).length) {
        await supabase.from('pos_inventory_transfer_items').update(patch).eq('id', u.id).eq('transfer_id', id);
      }
    }
  }

  // ── Deduct source stock on 'in_transit' (shipped) ──
  if (to_status === 'in_transit') {
    const { data: items } = await supabase.from('pos_inventory_transfer_items').select('*').eq('transfer_id', id);
    let totalCost = 0;
    for (const item of items ?? []) {
      const qty = Number(item.quantity_sent) || Number(item.quantity_approved) || 0;
      if (qty <= 0) continue;
      const { data: inv } = await supabase.from('pos_outlet_inventory')
        .select('outlet_id, product_id, items_on_hand, item_cost, last_item_cost, last_received_at')
        .eq('outlet_id', transfer.from_outlet_id).eq('product_id', item.product_id).maybeSingle();
      const unitCost = snapshotUnitCost(inv ?? null, (transfer.cost_method as CostMethod) ?? 'fifo');
      const lineCost = qty * unitCost;
      totalCost += lineCost;
      await supabase.from('pos_inventory_transfer_items').update({
        unit_cost: unitCost, line_cost: lineCost, quantity_sent: qty,
      }).eq('id', item.id);
      if (inv) {
        await supabase.from('pos_outlet_inventory').update({
          items_on_hand: Math.max(0, (Number(inv.items_on_hand) || 0) - qty),
          updated_at: now,
        }).eq('outlet_id', transfer.from_outlet_id).eq('product_id', item.product_id);
      }
    }
    updates.total_cost = +totalCost.toFixed(2);
  }

  // ── Add destination stock on 'received' ──
  if (to_status === 'received') {
    const { data: items } = await supabase.from('pos_inventory_transfer_items').select('*').eq('transfer_id', id);
    for (const item of items ?? []) {
      const qtyReceived = Number(item.quantity_received) || 0;
      if (qtyReceived <= 0) continue;
      const { data: destInv } = await supabase.from('pos_outlet_inventory')
        .select('items_on_hand').eq('outlet_id', transfer.to_outlet_id).eq('product_id', item.product_id).maybeSingle();
      if (destInv) {
        await supabase.from('pos_outlet_inventory').update({
          items_on_hand: (Number(destInv.items_on_hand) || 0) + qtyReceived,
          last_item_cost: Number(item.unit_cost) || 0,
          last_received_at: now, updated_at: now,
        }).eq('outlet_id', transfer.to_outlet_id).eq('product_id', item.product_id);
      } else {
        await supabase.from('pos_outlet_inventory').insert({
          business_id: bid, outlet_id: transfer.to_outlet_id, product_id: item.product_id,
          items_on_hand: qtyReceived, last_item_cost: Number(item.unit_cost) || 0,
          last_received_at: now,
        });
      }
    }
  }

  // ── Variance on 'reconciled' ──
  if (to_status === 'reconciled') {
    const { data: items } = await supabase.from('pos_inventory_transfer_items').select('*').eq('transfer_id', id);
    const variance = computeVariance((items ?? []).map(i => ({
      product_id: i.product_id,
      quantity_requested: Number(i.quantity_requested) || 0,
      quantity_approved: Number(i.quantity_approved) || 0,
      quantity_sent: Number(i.quantity_sent) || 0,
      quantity_received: Number(i.quantity_received) || 0,
      unit_cost: Number(i.unit_cost) || 0,
    })));
    updates.total_variance_units = variance.total_variance_units;
    updates.total_variance_cost = variance.total_variance_cost;
    for (const line of variance.lines) {
      await supabase.from('pos_inventory_transfer_items').update({
        variance_units: line.variance_units,
      }).eq('transfer_id', id).eq('product_id', line.product_id);
    }
  }

  await supabase.from('pos_inventory_transfers').update(updates).eq('id', id).eq('business_id', bid);

  const eventTypeMap: Partial<Record<TransferStatus, string>> = {
    requested: 'requested', approved: 'approved', in_transit: 'shipped',
    received: 'received', reconciled: 'reconciled', cancelled: 'cancelled',
  };
  await supabase.from('pos_transfer_events').insert({
    transfer_id: id, business_id: bid,
    event_type: eventTypeMap[to_status] ?? 'created',
    from_status: from, to_status,
    actor_user_id: user.id, actor_pos_user_id: pos_user_id ?? null,
    metadata: { cancellation_reason: cancellation_reason ?? null },
  });

  // Fire ariaObserve for negative variance on reconciled
  if (to_status === 'reconciled' && Number(updates.total_variance_units) < 0) {
    try {
      const { ariaObserve } = await import('@/lib/aria/brain');
      await ariaObserve({
        business_id: bid,
        category: 'inventory',
        event_type: 'transfer_variance_detected',
        data: {
          transfer_id: id,
          transfer_number: transfer.transfer_number,
          total_variance_units: updates.total_variance_units,
          total_variance_cost: updates.total_variance_cost,
          from_outlet_id: transfer.from_outlet_id,
          to_outlet_id: transfer.to_outlet_id,
        },
        triggered_by: 'transfers/transition',
      });
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return NextResponse.json({ ok: true, status: to_status });
}

export const POST = withErrorCapture('pos/transfers/[id]/transition', _POST);
