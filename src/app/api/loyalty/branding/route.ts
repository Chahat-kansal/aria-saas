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
  if (!bid) return NextResponse.json({ branding: null });
  const { data } = await supabase.from('businesses')
    .select('loyalty_program_name, loyalty_points_name, loyalty_points_expiry_months')
    .eq('id', bid).maybeSingle();
  return NextResponse.json({ branding: data ?? { loyalty_program_name: 'Aria Rewards', loyalty_points_name: 'points', loyalty_points_expiry_months: 12 } });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (body.loyalty_program_name !== undefined) patch.loyalty_program_name = body.loyalty_program_name;
  if (body.loyalty_points_name !== undefined) patch.loyalty_points_name = body.loyalty_points_name;
  if (body.loyalty_points_expiry_months !== undefined) patch.loyalty_points_expiry_months = body.loyalty_points_expiry_months;
  const { error } = await supabase.from('businesses').update(patch).eq('id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('loyalty/branding', _GET);
export const PATCH = withErrorCapture('loyalty/branding', _PATCH);
