export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ transfers: [] });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const productId = searchParams.get('product_id');

  // Per-product history mode
  if (productId) {
    const { data } = await supabase
      .from('pos_inventory_transfer_items')
      .select('*, pos_inventory_transfers(id, transfer_number, status, from_outlet_id, to_outlet_id, created_at, shipped_at, received_at)')
      .eq('product_id', productId);
    return NextResponse.json({ items: data ?? [] });
  }

  // Detail mode
  if (id) {
    const { data: transfer } = await supabase.from('pos_inventory_transfers')
      .select('*, from_outlet:pos_outlets!from_outlet_id(name), to_outlet:pos_outlets!to_outlet_id(name)')
      .eq('id', id).eq('business_id', bid).maybeSingle();
    if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: items } = await supabase.from('pos_inventory_transfer_items')
      .select('*, pos_products(id, name, sku)')
      .eq('transfer_id', id);
    const { data: events } = await supabase.from('pos_transfer_events')
      .select('*').eq('transfer_id', id).order('created_at', { ascending: true });
    return NextResponse.json({ transfer, items: items ?? [], events: events ?? [] });
  }

  // List mode
  const status = searchParams.get('status');
  let query = supabase.from('pos_inventory_transfers')
    .select('*, from_outlet:pos_outlets!from_outlet_id(name), to_outlet:pos_outlets!to_outlet_id(name)')
    .eq('business_id', bid);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error?.code === '42P01') return NextResponse.json({ transfers: [] });
  return NextResponse.json({ transfers: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { from_outlet_id, to_outlet_id, items, notes, expected_arrival_at, cost_method, submit_for_approval } = await req.json();
  if (!from_outlet_id || !to_outlet_id || from_outlet_id === to_outlet_id || !items?.length) {
    return NextResponse.json({ error: 'from_outlet_id, to_outlet_id (different), and items required' }, { status: 400 });
  }

  const { count } = await supabase.from('pos_inventory_transfers').select('id', { count: 'exact', head: true }).eq('business_id', bid);
  const transferNum = `TRF-${String((count ?? 0) + 1).padStart(4, '0')}`;

  const initialStatus = submit_for_approval ? 'requested' : 'draft';
  const now = new Date().toISOString();

  const { data: transfer, error: tErr } = await supabase.from('pos_inventory_transfers').insert({
    business_id: bid,
    from_outlet_id,
    to_outlet_id,
    status: initialStatus,
    transfer_number: transferNum,
    notes: notes ?? null,
    expected_arrival_at: expected_arrival_at ?? null,
    cost_method: cost_method ?? 'fifo',
    created_by: user.id,
    requested_by: submit_for_approval ? user.id : null,
    requested_at: submit_for_approval ? now : null,
  }).select().single();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const lineRows = (items as Array<{ product_id: string; product_name: string; quantity_requested: number }>).map(i => ({
    transfer_id: transfer.id,
    business_id: bid,
    product_id: i.product_id,
    product_name: i.product_name ?? '',
    quantity_requested: Number(i.quantity_requested) || 0,
    quantity_approved: 0,
    quantity_sent: 0,
    quantity_received: 0,
    unit_cost: 0,
    line_cost: 0,
  }));
  await supabase.from('pos_inventory_transfer_items').insert(lineRows);

  await supabase.from('pos_transfer_events').insert({
    transfer_id: transfer.id, business_id: bid,
    event_type: submit_for_approval ? 'requested' : 'created',
    from_status: null, to_status: initialStatus,
    actor_user_id: user.id,
    metadata: { items_count: items.length },
  });

  return NextResponse.json({ transfer });
}

export const GET = withErrorCapture('pos/transfers', _GET);
export const POST = withErrorCapture('pos/transfers', _POST);
