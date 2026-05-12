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

  let q = supabase.from('warehouse_despatches').select('*').eq('business_id', business_id).order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q.limit(100);
  return NextResponse.json({ despatches: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, despatch_type = 'outbound', carrier, tracking_number, recipient_name, recipient_address, recipient_city, recipient_state, recipient_postcode, items, total_weight_kg, notes } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { count } = await supabase.from('warehouse_despatches').select('id', { count: 'exact', head: true }).eq('business_id', business_id);
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const despatch_number = `DSP-${today}-${String((count ?? 0) + 1).padStart(3, '0')}`;

  const { data, error } = await supabase.from('warehouse_despatches').insert({
    business_id, despatch_number, despatch_type, carrier: carrier ?? null,
    tracking_number: tracking_number ?? null, recipient_name: recipient_name ?? null,
    recipient_address: recipient_address ?? null, recipient_city: recipient_city ?? null,
    recipient_state: recipient_state ?? null, recipient_postcode: recipient_postcode ?? null,
    items: items ?? [], total_weight_kg: total_weight_kg ?? null, notes: notes ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ despatch: data, despatch_number }, { status: 201 });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const body = await req.json().catch(() => ({}));
  const { business_id, status, tracking_number, notes } = body;
  if (!id || !business_id) return NextResponse.json({ error: 'id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (status) {
    updates.status = status;
    if (status === 'packed') updates.packed_at = new Date().toISOString();
    if (status === 'despatched') updates.despatched_at = new Date().toISOString();
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();
  }
  if (tracking_number !== undefined) updates.tracking_number = tracking_number;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase.from('warehouse_despatches').update(updates).eq('id', id).eq('business_id', business_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ despatch: data });
}

export const GET = withErrorCapture('warehouse/despatch', _GET)
export const POST = withErrorCapture('warehouse/despatch', _POST)
export const PATCH = withErrorCapture('warehouse/despatch', _PATCH)
