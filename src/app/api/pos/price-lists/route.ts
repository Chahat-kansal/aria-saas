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
  if (!bid) return NextResponse.json({ price_lists: [] });
  const { searchParams } = new URL(req.url);
  const listId = searchParams.get('list_id');
  if (listId) {
    const { data } = await supabase.from('pos_price_list_items')
      .select('*, pos_products(id, name, price)')
      .eq('price_list_id', listId)
      .order('created_at');
    return NextResponse.json({ items: data ?? [] });
  }
  const { data: lists, error: plErr } = await supabase.from('pos_price_lists').select('*').eq('business_id', bid).order('name');
  if (plErr?.code === '42P01') return NextResponse.json({ price_lists: [] });
  const counts = await Promise.all((lists ?? []).map(l =>
    supabase.from('pos_price_list_items').select('id', { count: 'exact', head: true }).eq('price_list_id', l.id)
  ));
  const result = (lists ?? []).map((l, i) => ({ ...l, item_count: counts[i].count ?? 0 }));
  return NextResponse.json({ price_lists: result });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  const { item } = body;
  if (item) {
    const { data, error } = await supabase.from('pos_price_list_items').upsert(item, { onConflict: 'price_list_id,product_id' }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }
  const { data, error } = await supabase.from('pos_price_lists').insert({ ...body, business_id: bid }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ price_list: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const { error } = await supabase.from('pos_price_lists').update(body).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('pos_price_list_items').delete().eq('price_list_id', id);
  await supabase.from('pos_price_lists').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/price-lists', _GET)
export const POST = withErrorCapture('pos/price-lists', _POST)
export const PATCH = withErrorCapture('pos/price-lists', _PATCH)
export const DELETE = withErrorCapture('pos/price-lists', _DELETE)
