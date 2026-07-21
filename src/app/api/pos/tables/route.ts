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
  if (!bid) return NextResponse.json({ tables: [] });

  const { data, error } = await supabase
    .from('pos_tables')
    .select('*')
    .eq('business_id', bid)
    .is('archived_at', null)
    .order('section', { nullsFirst: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tables: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  const { name, section, seats, shape, pos_x, pos_y,
          // legacy field aliases
          table_number, zone, x_position, y_position,
          // BOOKINGS-MOCKUP-MATCH layout-editor fields
          width, height, rotation, element_type, seating_area, display_name, is_guest_selectable } = body;
  const resolvedName = name ?? table_number;
  if (!resolvedName) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('pos_tables')
    .insert({
      name: resolvedName,
      table_number: resolvedName,
      section: section ?? zone ?? null,
      zone: zone ?? section ?? null,
      seats: seats ?? 2,
      shape: shape ?? 'square',
      pos_x: pos_x ?? x_position ?? 0,
      pos_y: pos_y ?? y_position ?? 0,
      width: width ?? 72,
      height: height ?? 72,
      rotation: rotation ?? 0,
      element_type: element_type ?? 'table',
      seating_area: seating_area ?? null,
      display_name: display_name ?? null,
      is_guest_selectable: is_guest_selectable ?? false,
      status: 'available',
      business_id: bid,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ table: data });
}

export const GET = withErrorCapture('pos/tables', _GET)
export const POST = withErrorCapture('pos/tables', _POST)
