export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

const RULE_TYPES = ['review_left','birthday_visit','referral_made','fifth_visit','spending_milestone'];

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
  if (!bid) return NextResponse.json({ rules: [] });
  const { data } = await supabase.from('loyalty_reward_rules').select('*').eq('business_id', bid);
  return NextResponse.json({ rules: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  if (!RULE_TYPES.includes(body.rule_type)) {
    return NextResponse.json({ error: 'invalid rule_type' }, { status: 400 });
  }
  const { data, error } = await supabase.from('loyalty_reward_rules').insert({
    business_id: bid,
    rule_type: body.rule_type,
    points_value: body.points_value ?? 25,
    is_active: body.is_active ?? true,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (body.points_value !== undefined) patch.points_value = body.points_value;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  await supabase.from('loyalty_reward_rules').update(patch).eq('id', id);
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('loyalty_reward_rules').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('loyalty/reward-rules', _GET);
export const POST = withErrorCapture('loyalty/reward-rules', _POST);
export const PATCH = withErrorCapture('loyalty/reward-rules', _PATCH);
export const DELETE = withErrorCapture('loyalty/reward-rules', _DELETE);
