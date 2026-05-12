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
  if (id) {
    const { data: items } = await supabase.from('pos_inventory_transfer_items')
      .select('*, pos_products(id, name, sku)')
      .eq('transfer_id', id);
    return NextResponse.json({ items: items ?? [] });
  }
  const { data, error: trErr } = await supabase.from('pos_inventory_transfers')
    .select('*, from_outlet:pos_outlets!from_outlet_id(name), to_outlet:pos_outlets!to_outlet_id(name)')
    .eq('business_id', bid)
    .order('created_at', { ascending: false });
  if (trErr?.code === '42P01') return NextResponse.json({ transfers: [] });
  return NextResponse.json({ transfers: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { from_outlet_id, to_outlet_id, items, notes } = await req.json();
  if (!from_outlet_id || !to_outlet_id || !items?.length) {
    return NextResponse.json({ error: 'from_outlet_id, to_outlet_id and items required' }, { status: 400 });
  }
  const count = await supabase.from('pos_inventory_transfers').select('id', { count: 'exact', head: true }).eq('business_id', bid);
  const transferNum = `TRF-${String((count.count ?? 0) + 1).padStart(4, '0')}`;
  const { data: transfer, error: tErr } = await supabase.from('pos_inventory_transfers').insert({
    business_id: bid, from_outlet_id, to_outlet_id,
    transfer_number: transferNum, status: 'pending', notes: notes ?? null,
  }).select().single();
  if (tErr || !transfer) return NextResponse.json({ error: tErr?.message ?? 'Failed' }, { status: 500 });
  const transferItems = items.map((i: { product_id: string; quantity: number }) => ({
    transfer_id: transfer.id, product_id: i.product_id, quantity_sent: i.quantity,
  }));
  await supabase.from('pos_inventory_transfer_items').insert(transferItems);
  return NextResponse.json({ transfer });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { status, received_items } = await req.json();
  if (status === 'completed' && received_items) {
    for (const ri of received_items) {
      await supabase.from('pos_inventory_transfer_items')
        .update({ quantity_received: ri.quantity_received })
        .eq('transfer_id', id).eq('product_id', ri.product_id);
    }
  }
  await supabase.from('pos_inventory_transfers').update({ status }).eq('id', id);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/transfers', _GET)
export const POST = withErrorCapture('pos/transfers', _POST)
export const PATCH = withErrorCapture('pos/transfers', _PATCH)
