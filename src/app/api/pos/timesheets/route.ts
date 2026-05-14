export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ sessions: [] });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('pos_timesheets')
    .select('id, business_id, staff_id, staff_name, clock_in, clock_out, break_minutes, pay_rate_cents, notes, created_at')
    .eq('business_id', bid)
    .gte('clock_in', from.toISOString())
    .lte('clock_in', to.toISOString())
    .order('clock_in', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute total_minutes for the client (clock_in → clock_out diff)
  const sessions = (data ?? []).map((s) => {
    const total_minutes = s.clock_out
      ? Math.round((new Date(s.clock_out as string).getTime() - new Date(s.clock_in as string).getTime()) / 60000) - (s.break_minutes ?? 0)
      : null;
    return { ...s, total_minutes };
  });

  return NextResponse.json({ sessions });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { staff_id, staff_name } = await req.json();
  if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 });

  // Check for existing open session
  const { data: existing } = await supabase
    .from('pos_timesheets')
    .select('id')
    .eq('staff_id', staff_id)
    .eq('business_id', bid)
    .is('clock_out', null)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'Staff member already clocked in' }, { status: 409 });

  const { data, error } = await supabase
    .from('pos_timesheets')
    .insert({
      staff_id,
      staff_name: staff_name ?? null,
      business_id: bid,
      clock_in: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { session_id, break_minutes } = await req.json();
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  // Fetch session to verify it's open
  const { data: session, error: fetchError } = await supabase
    .from('pos_timesheets')
    .select('id, clock_in')
    .eq('id', session_id)
    .eq('business_id', bid)
    .is('clock_out', null)
    .single();

  if (fetchError || !session) return NextResponse.json({ error: 'Open session not found' }, { status: 404 });

  const now = new Date();
  const updates: Record<string, unknown> = { clock_out: now.toISOString() };
  if (break_minutes !== undefined) updates.break_minutes = break_minutes;

  const { data, error } = await supabase
    .from('pos_timesheets')
    .update(updates)
    .eq('id', session_id)
    .eq('business_id', bid)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export const GET = withErrorCapture('pos/timesheets', _GET)
export const POST = withErrorCapture('pos/timesheets', _POST)
export const PATCH = withErrorCapture('pos/timesheets', _PATCH)