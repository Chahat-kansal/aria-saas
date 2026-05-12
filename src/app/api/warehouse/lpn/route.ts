export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

async function verifyOwnership(supabase: SupabaseClient, userId: string, businessId: string) {
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', userId)
    .single();
  return biz ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const lpn_number = searchParams.get('lpn_number');

  let query = supabase
    .from('warehouse_lpn')
    .select('*')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false });

  if (lpn_number) query = query.ilike('lpn_number', `%${lpn_number}%`);

  const { data } = await query.limit(200);
  return NextResponse.json({ lpns: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    business_id: string;
    lpn_number: string;
    lpn_type?: string;
    location_id?: string;
    location_name?: string;
    items?: unknown;
    weight_kg?: number;
    notes?: string;
  };

  const { business_id, lpn_number, lpn_type, location_id, location_name, items, weight_kg, notes } = body;
  if (!business_id || !lpn_number) {
    return NextResponse.json({ error: 'business_id and lpn_number required' }, { status: 400 });
  }

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('warehouse_lpn')
    .insert({
      business_id,
      lpn_number,
      lpn_type: lpn_type ?? 'carton',
      location_id: location_id ?? null,
      location_name: location_name ?? null,
      items: items ?? null,
      weight_kg: weight_kg ?? null,
      notes: notes ?? null,
      status: 'active',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lpn: data }, { status: 201 });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json() as {
    business_id: string;
    location_id?: string;
    location_name?: string;
    status?: string;
    items?: unknown;
    weight_kg?: number;
    notes?: string;
  };

  const { business_id } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.location_id !== undefined) updates.location_id = body.location_id;
  if (body.location_name !== undefined) updates.location_name = body.location_name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.items !== undefined) updates.items = body.items;
  if (body.weight_kg !== undefined) updates.weight_kg = body.weight_kg;
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error } = await supabase
    .from('warehouse_lpn')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lpn: data });
}

export const GET = withErrorCapture('warehouse/lpn', _GET)
export const POST = withErrorCapture('warehouse/lpn', _POST)
export const PATCH = withErrorCapture('warehouse/lpn', _PATCH)
