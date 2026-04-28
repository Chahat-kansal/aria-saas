import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data } = await supabase.from('warehouse_locations').select('*').eq('business_id', business_id).order('zone').order('bay').order('shelf');
  return NextResponse.json({ locations: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { business_id, bulk } = body;
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (bulk) {
    // Bulk-generate locations: zone × bays × shelves
    const { zone, bay_count, shelf_count, temperature_zone } = body;
    const locs = [];
    for (let b = 1; b <= bay_count; b++) {
      for (let s = 1; s <= shelf_count; s++) {
        locs.push({ business_id, zone, bay: String(b), shelf: String(s), label: `${zone}-B${b}-S${s}`, temperature_zone: temperature_zone ?? 'ambient' });
      }
    }
    const { data } = await supabase.from('warehouse_locations').insert(locs).select();
    return NextResponse.json({ locations: data ?? [], created: locs.length });
  }

  const { data, error: e } = await supabase.from('warehouse_locations').insert({ ...body, business_id }).select().single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ location: data });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('warehouse_locations').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
