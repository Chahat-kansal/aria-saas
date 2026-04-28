export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = searchParams.get('status');
  let query = supabase.from('warehouse_purchase_orders')
    .select('*')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) query = query.eq('status', status);

  const { data } = await query;
  return NextResponse.json({ orders: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (!await verifyBiz(supabase, user.id, body.business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Auto-generate PO number
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase.from('warehouse_purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', body.business_id)
    .like('po_number', `PO-${date}%`);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const po_number = `PO-${date}-${seq}`;

  const { data, error: e } = await supabase.from('warehouse_purchase_orders')
    .insert({ ...body, po_number, status: body.status ?? 'draft' })
    .select().single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  if (!await verifyBiz(supabase, user.id, body.business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { status, notes, expected_delivery } = body;
  const updates: any = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (expected_delivery) updates.expected_delivery = expected_delivery;
  const { data, error: e } = await supabase.from('warehouse_purchase_orders').update(updates).eq('id', id).eq('business_id', body.business_id).select().single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const business_id = searchParams.get('business_id');
  if (!id || !business_id) return NextResponse.json({ error: 'id and business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await supabase.from('warehouse_purchase_orders').delete().eq('id', id).eq('business_id', business_id);
  return NextResponse.json({ ok: true });
}
