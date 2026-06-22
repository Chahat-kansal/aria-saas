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

interface ReferralRow { id: string; referrer_customer_id: string | null; referral_code: string | null; referral_date: string; referrer_points_awarded: number | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ referrals: [], leaderboard: [] });

  const { data: referrals } = await supabase.from('loyalty_referrals')
    .select('id, referrer_customer_id, referred_customer_id, referral_code, referral_date, referrer_points_awarded, referred_points_awarded')
    .eq('business_id', bid)
    .order('referral_date', { ascending: false })
    .limit(100);

  // Build leaderboard
  const counts: Record<string, { count: number; points: number }> = {};
  for (const r of (referrals ?? []) as ReferralRow[]) {
    const key = r.referrer_customer_id ?? 'unknown';
    if (!counts[key]) counts[key] = { count: 0, points: 0 };
    counts[key].count++;
    counts[key].points += Number(r.referrer_points_awarded ?? 0);
  }
  const ids = Object.keys(counts).filter(id => id !== 'unknown');
  const { data: customers } = ids.length > 0
    ? await supabase.from('pos_customers').select('id, name').in('id', ids)
    : { data: [] };
  const nameMap = new Map((customers ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const leaderboard = Object.entries(counts)
    .map(([id, v]) => ({ customer_id: id, name: nameMap.get(id) ?? 'Unknown', referrals: v.count, points_earned: v.points }))
    .sort((a, b) => b.referrals - a.referrals).slice(0, 10);

  // LOY-REFERRALS — owner config (enable + the existing bonus fields) for the dashboard toggle.
  const { data: cfg } = await supabase.from('pos_loyalty_config')
    .select('referrals_enabled, referral_bonus_points, referee_bonus_points').eq('business_id', bid).maybeSingle();
  const config = {
    enabled: !!cfg?.referrals_enabled,
    referrer_points: Number(cfg?.referral_bonus_points ?? 100),
    referee_points: Number(cfg?.referee_bonus_points ?? 50),
  };

  return NextResponse.json({ referrals: referrals ?? [], leaderboard, config });
}

function genCode(name: string): string {
  const clean = (name ?? 'FRIEND').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'FRIEND';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${clean}${suffix}`;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const body = await req.json();

  // LOY-REFERRALS — Mode C: owner config (enable + referrer/referee bonus, the existing config fields).
  if (body.config) {
    const enabled = !!body.enabled;
    const referrer = Math.max(0, Math.min(100000, Math.round(Number(body.referrer_points) || 0)));
    const referee = Math.max(0, Math.min(100000, Math.round(Number(body.referee_points) || 0)));
    const { data: existing } = await supabase.from('pos_loyalty_config').select('business_id').eq('business_id', bid).maybeSingle();
    const patch = { referrals_enabled: enabled, referral_bonus_points: referrer, referee_bonus_points: referee };
    if (existing) await supabase.from('pos_loyalty_config').update(patch).eq('business_id', bid);
    else await supabase.from('pos_loyalty_config').insert({ business_id: bid, ...patch });
    return NextResponse.json({ ok: true, config: { enabled, referrer_points: referrer, referee_points: referee } });
  }

  // Mode A: generate/return code for an existing customer
  if (body.customer_id && !body.referred_customer_id) {
    const { data: cust } = await supabase.from('pos_customers')
      .select('id, name, referral_code').eq('id', body.customer_id).maybeSingle();
    if (!cust) return NextResponse.json({ error: 'customer not found' }, { status: 404 });
    if (cust.referral_code) return NextResponse.json({ referral_code: cust.referral_code });
    const code = genCode(cust.name as string);
    await supabase.from('pos_customers').update({ referral_code: code }).eq('id', cust.id);
    return NextResponse.json({ referral_code: code });
  }

  // Mode B: record a successful referral (used at POS)
  if (body.referral_code && body.referred_customer_id) {
    const { data: referrer } = await supabase.from('pos_customers')
      .select('id').eq('business_id', bid).eq('referral_code', body.referral_code).maybeSingle();
    if (!referrer) return NextResponse.json({ error: 'invalid code' }, { status: 400 });
    const { data, error } = await supabase.from('loyalty_referrals').insert({
      business_id: bid,
      referrer_customer_id: referrer.id,
      referred_customer_id: body.referred_customer_id,
      referral_code: body.referral_code,
      referrer_points_awarded: body.referrer_points ?? 100,
      referred_points_awarded: body.referred_points ?? 50,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ referral: data });
  }

  return NextResponse.json({ error: 'customer_id or referral_code+referred_customer_id required' }, { status: 400 });
}

export const GET = withErrorCapture('loyalty/referrals', _GET);
export const POST = withErrorCapture('loyalty/referrals', _POST);
