export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ laybys: [] });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'active';
  let q = supabase.from('pos_laybys').select('*,customers(name,phone)').eq('business_id', bid).order('created_at', { ascending: false }).limit(100);
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return NextResponse.json({ laybys: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  const { data } = await supabase.from('pos_laybys').insert({ business_id: bid, ...body }).select().single();
  return NextResponse.json({ layby: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, ...updates } = await req.json();
  const { data } = await supabase.from('pos_laybys').update(updates).eq('id', id).select().single();
  return NextResponse.json({ layby: data });
}

export const GET = withErrorCapture('pos/laybys', _GET)
export const POST = withErrorCapture('pos/laybys', _POST)
export const PATCH = withErrorCapture('pos/laybys', _PATCH)
