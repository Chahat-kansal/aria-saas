export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase
    .from('warehouse_item_locations')
    .select('item_id, location_id, warehouse_locations(label, zone, bay)')
    .eq('business_id', business_id);

  // Enrich with item names
  const itemIds = [...new Set((data ?? []).map((il: any) => il.item_id))];
  let itemNames: Record<string, string> = {};
  if (itemIds.length) {
    const { data: products } = await supabase.from('pos_products').select('id, name').in('id', itemIds);
    for (const p of products ?? []) itemNames[p.id] = p.name;
  }

  const items = (data ?? []).map((il: any) => ({
    item_id: il.item_id,
    item_name: itemNames[il.item_id] ?? 'Unknown',
    location_id: il.location_id,
    location_label: il.warehouse_locations?.label ?? '',
    zone: il.warehouse_locations?.zone ?? '',
    bay: il.warehouse_locations?.bay ?? '',
  }));

  return NextResponse.json({ items });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { business_id, item_id, location_id } = body;
  if (!business_id || !item_id || !location_id) return NextResponse.json({ error: 'business_id, item_id, location_id required' }, { status: 400 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: e } = await supabase.from('warehouse_item_locations').upsert({ business_id, item_id, location_id }, { onConflict: 'business_id,item_id' });
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const item_id = searchParams.get('item_id');
  const business_id = searchParams.get('business_id');
  if (!item_id || !business_id) return NextResponse.json({ error: 'item_id and business_id required' }, { status: 400 });
  await supabase.from('warehouse_item_locations').delete().eq('item_id', item_id).eq('business_id', business_id);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('warehouse/item-locations', _GET)
export const POST = withErrorCapture('warehouse/item-locations', _POST)
export const DELETE = withErrorCapture('warehouse/item-locations', _DELETE)
