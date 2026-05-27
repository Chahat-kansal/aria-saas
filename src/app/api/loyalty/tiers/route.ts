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
  if (!bid) return NextResponse.json({ tiers: [] });
  const { data } = await supabase.from('loyalty_tiers').select('*').eq('business_id', bid).order('tier_order', { ascending: true });
  return NextResponse.json({ tiers: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  const { data, error } = await supabase.from('loyalty_tiers').insert({
    business_id: bid,
    tier_name: body.tier_name ?? 'Bronze',
    tier_order: body.tier_order ?? 1,
    min_spend: body.min_spend ?? 0,
    points_multiplier: body.points_multiplier ?? 1,
    perks: body.perks ?? null,
    color: body.color ?? '#7FB897',
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ['tier_name','tier_order','min_spend','points_multiplier','perks','color']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const { error } = await supabase.from('loyalty_tiers').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('loyalty_tiers').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('loyalty/tiers', _GET);
export const POST = withErrorCapture('loyalty/tiers', _POST);
export const PATCH = withErrorCapture('loyalty/tiers', _PATCH);
export const DELETE = withErrorCapture('loyalty/tiers', _DELETE);
