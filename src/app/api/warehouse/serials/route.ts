export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

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

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const item_id = searchParams.get('item_id');
  const status = searchParams.get('status');

  let query = supabase
    .from('warehouse_serials')
    .select('*')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false });

  if (item_id) query = query.eq('item_id', item_id);
  if (status) query = query.eq('status', status);

  const { data } = await query.limit(500);
  return NextResponse.json({ serials: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    business_id: string;
    item_id: string;
    item_name: string;
    lot_id?: string;
    serial_numbers: string[];
  };

  const { business_id, item_id, item_name, lot_id, serial_numbers } = body;
  if (!business_id || !item_id || !item_name || !serial_numbers?.length) {
    return NextResponse.json({ error: 'business_id, item_id, item_name, serial_numbers required' }, { status: 400 });
  }

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = serial_numbers.map((sn: string) => ({
    business_id,
    item_id,
    item_name,
    lot_id: lot_id ?? null,
    serial_number: sn,
    status: 'in_stock',
  }));

  const { data, error } = await supabase
    .from('warehouse_serials')
    .insert(rows)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ serials: data ?? [] }, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json() as {
    business_id: string;
    status?: string;
    notes?: string;
    sold_order_id?: string;
    sold_at?: string;
  };

  const { business_id } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const biz = await verifyOwnership(supabase, user.id, business_id);
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.sold_order_id !== undefined) updates.sold_order_id = body.sold_order_id;
  if (body.sold_at !== undefined) updates.sold_at = body.sold_at;

  const { data, error } = await supabase
    .from('warehouse_serials')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ serial: data });
}
