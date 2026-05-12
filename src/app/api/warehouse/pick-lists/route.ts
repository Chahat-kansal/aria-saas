export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const status = searchParams.get('status');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let q = supabase.from('warehouse_pick_lists').select('*').eq('business_id', business_id).order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q.limit(100);
  return NextResponse.json({ pick_lists: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, pick_type = 'standard', assigned_to, items, order_ids } = body;
  if (!business_id || !items?.length) return NextResponse.json({ error: 'business_id and items required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { count } = await supabase.from('warehouse_pick_lists').select('id', { count: 'exact', head: true }).eq('business_id', business_id);
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const pick_number = `PCK-${today}-${String((count ?? 0) + 1).padStart(3, '0')}`;

  const { data, error } = await supabase.from('warehouse_pick_lists').insert({
    business_id, pick_number, pick_type, assigned_to: assigned_to ?? null,
    items, order_ids: order_ids ?? [],
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pick_list: data, pick_number }, { status: 201 });
}

export const GET = withErrorCapture('warehouse/pick-lists', _GET)
export const POST = withErrorCapture('warehouse/pick-lists', _POST)
