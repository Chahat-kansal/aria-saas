export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

type Params = { params: Promise<{ id: string }> };

async function _POST(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { data: transfer } = await supabase.from('pos_inventory_transfers').select('status').eq('id', id).eq('business_id', bid).maybeSingle();
  if (!transfer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (transfer.status !== 'draft') return NextResponse.json({ error: 'Items only editable in draft' }, { status: 400 });

  const { product_id, product_name, quantity_requested } = await req.json();
  if (!product_id || !quantity_requested) return NextResponse.json({ error: 'product_id and quantity_requested required' }, { status: 400 });
  const { data, error } = await supabase.from('pos_inventory_transfer_items').insert({
    transfer_id: id, business_id: bid, product_id, product_name: product_name ?? '',
    quantity_requested: Number(quantity_requested) || 0,
    quantity_approved: 0, quantity_sent: 0, quantity_received: 0, unit_cost: 0, line_cost: 0,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from('pos_transfer_events').insert({
    transfer_id: id, business_id: bid, event_type: 'item_added',
    from_status: 'draft', to_status: 'draft', actor_user_id: user.id,
    metadata: { product_id, quantity_requested },
  });
  return NextResponse.json({ item: data });
}

async function _DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('item_id');
  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 });
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { data: transfer } = await supabase.from('pos_inventory_transfers').select('status').eq('id', id).eq('business_id', bid).maybeSingle();
  if (!transfer || transfer.status !== 'draft') return NextResponse.json({ error: 'Not allowed' }, { status: 400 });
  await supabase.from('pos_inventory_transfer_items').delete().eq('id', itemId).eq('transfer_id', id);
  await supabase.from('pos_transfer_events').insert({
    transfer_id: id, business_id: bid, event_type: 'item_removed',
    from_status: 'draft', to_status: 'draft', actor_user_id: user.id,
    metadata: { item_id: itemId },
  });
  return NextResponse.json({ ok: true });
}

export const POST = withErrorCapture('pos/transfers/[id]/items', _POST);
export const DELETE = withErrorCapture('pos/transfers/[id]/items', _DELETE);
