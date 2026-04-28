export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { business_id, item_id, from_location_id, to_location_id, quantity, notes } = body;
  if (!business_id || !item_id || !to_location_id || !quantity) {
    return NextResponse.json({ error: 'business_id, item_id, to_location_id, quantity required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Update item location
  await supabase.from('warehouse_item_locations').upsert({ business_id, item_id, location_id: to_location_id }, { onConflict: 'business_id,item_id' });

  // Log movement
  await supabase.from('stock_movements').insert({
    business_id, item_id,
    movement_type: 'transfer',
    quantity_added: 0,
    new_stock: null,
    notes: notes ?? `Transfer to location ${to_location_id}${from_location_id ? ` from ${from_location_id}` : ''}`,
  }).then(() => null, () => null);

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase.from('stock_movements')
    .select('*')
    .eq('business_id', business_id)
    .eq('movement_type', 'transfer')
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ transfers: data ?? [] });
}
