export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ schedules: [] });
  const { data } = await supabase.from('scheduled_price_changes').select('*').eq('business_id', bid).order('created_at', { ascending: false });
  return NextResponse.json({ schedules: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  if (!body.product_id || body.timed_price == null || !Array.isArray(body.days_of_week) || !body.start_time || !body.end_time) {
    return NextResponse.json({ error: 'product_id, timed_price, days_of_week, start_time, end_time required' }, { status: 400 });
  }
  const { data: prod } = await supabase.from('pos_products').select('name, price').eq('id', body.product_id).eq('business_id', bid).maybeSingle();
  if (!prod) return NextResponse.json({ error: 'product not found' }, { status: 404 });
  const { data, error } = await supabase.from('scheduled_price_changes').insert({
    business_id: bid,
    product_id: body.product_id,
    product_name: prod.name,
    original_price: prod.price,
    timed_price: body.timed_price,
    days_of_week: body.days_of_week,
    start_time: body.start_time,
    end_time: body.end_time,
    label: body.label ?? null,
    is_active: true,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ['timed_price','days_of_week','start_time','end_time','label','is_active']) if (body[k] !== undefined) patch[k] = body[k];
  await supabase.from('scheduled_price_changes').update(patch).eq('id', id);
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('scheduled_price_changes').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/timed-prices', _GET);
export const POST = withErrorCapture('pos/timed-prices', _POST);
export const PATCH = withErrorCapture('pos/timed-prices', _PATCH);
export const DELETE = withErrorCapture('pos/timed-prices', _DELETE);
