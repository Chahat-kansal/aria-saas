import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
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
  const verified = await getBid(supabase, user.id, business_id);
  if (!verified) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const expiring = searchParams.get('expiring');
  const status = searchParams.get('status');

  let query = supabase.from('warehouse_lots').select('*').eq('business_id', business_id).order('expiry_date', { ascending: true, nullsFirst: false });

  if (expiring) {
    const cutoff = new Date(Date.now() + parseInt(expiring) * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    query = query.lte('expiry_date', cutoff).gte('expiry_date', today).gt('quantity_remaining', 0).eq('status', 'active');
  }
  if (status) query = query.eq('status', status);

  const { data } = await query.limit(200);
  return NextResponse.json({ lots: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const verified = await getBid(supabase, user.id, body.business_id);
  if (!verified) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error: e } = await supabase.from('warehouse_lots').insert({ ...body }).select().single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ lot: data });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const { business_id, quantity_remaining, status, reason } = body;
  const verified = await getBid(supabase, user.id, business_id);
  if (!verified) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: any = {};
  if (quantity_remaining !== undefined) updates.quantity_remaining = quantity_remaining;
  if (status) updates.status = status;

  await supabase.from('warehouse_lots').update(updates).eq('id', id).eq('business_id', business_id);

  // Log movement if quantity changed
  if (quantity_remaining !== undefined && body.item_id) {
    const { data: lot } = await supabase.from('warehouse_lots').select('quantity_remaining').eq('id', id).single();
    const diff = quantity_remaining - (lot?.quantity_remaining ?? 0);
    if (diff !== 0) {
      await supabase.from('stock_movements').insert({
        business_id, item_id: body.item_id,
        movement_type: status === 'recalled' ? 'recall' : 'lot_adjustment',
        quantity_added: diff, new_stock: quantity_remaining,
        notes: reason ?? 'Manual lot adjustment',
      }).then(() => null, () => null);
    }
  }
  return NextResponse.json({ ok: true });
}
