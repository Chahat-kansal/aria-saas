export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, zone, bay_count, shelf_count, temperature_zone } = await req.json();
  if (!business_id || !zone || !bay_count || !shelf_count) {
    return NextResponse.json({ error: 'business_id, zone, bay_count, shelf_count required' }, { status: 400 });
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const locs: { business_id: string; zone: string; bay: string; shelf: string; label: string; temperature_zone: string }[] = [];
  for (let b = 1; b <= Math.min(bay_count, 50); b++) {
    for (let s = 1; s <= Math.min(shelf_count, 20); s++) {
      locs.push({
        business_id,
        zone: zone.toUpperCase(),
        bay: String(b),
        shelf: String(s),
        label: `${zone.toUpperCase()}-B${b}-S${s}`,
        temperature_zone: temperature_zone ?? 'ambient',
      });
    }
  }

  const { data, error: e } = await supabase
    .from('warehouse_locations')
    .insert(locs)
    .select('id, label');

  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ created: data?.length ?? 0, locations: data ?? [] });
}

export const POST = withErrorCapture('warehouse/locations/bulk', _POST)
