export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const product_id = searchParams.get('product_id');
  const outlet_id  = searchParams.get('outlet_id');

  let query = supabase.from('pos_price_points').select('*').order('quantity');
  if (product_id) query = query.eq('product_id', product_id);
  if (outlet_id)  query = query.eq('outlet_id', outlet_id);

  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ price_points: [] }); // table not yet created
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ price_points: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { product_id, outlet_id, price_set_name, quantity, price, cost } = body;
  if (!product_id || !quantity || !price) return NextResponse.json({ error: 'product_id, quantity, price required' }, { status: 400 });

  const margin_percent = cost && price > 0 ? ((price - cost) / price) * 100 : null;

  const { data, error } = await supabase.from('pos_price_points').insert({
    product_id, outlet_id: outlet_id ?? null,
    price_set_name: price_set_name ?? 'Default Price Set',
    quantity: parseInt(quantity), price: parseFloat(price),
    cost: cost ? parseFloat(cost) : null, margin_percent,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ price_point: data });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  if (body.price && body.cost) {
    body.margin_percent = ((body.price - body.cost) / body.price) * 100;
  }

  const { error } = await supabase.from('pos_price_points').update(body).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('pos_price_points').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
