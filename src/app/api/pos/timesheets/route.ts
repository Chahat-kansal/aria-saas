export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
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
    .from('pos_employee_sessions')
    .select('*, staff_members(name)')
    .eq('business_id', bid)
    .gte('clocked_in_at', from.toISOString())
    .lte('clocked_in_at', to.toISOString())
    .order('clocked_in_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessions = (data ?? []).map((s) => {
    const totalMinutes = s.clocked_out_at
      ? Math.round((new Date(s.clocked_out_at as string).getTime() - new Date(s.clocked_in_at as string).getTime()) / 60000)
      : null;
    return { ...s, total_minutes: totalMinutes };
  });

  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { staff_member_id, staff_name } = await req.json();
  if (!staff_member_id) return NextResponse.json({ error: 'staff_member_id required' }, { status: 400 });

  // Check for existing open session
  const { data: existing } = await supabase
    .from('pos_employee_sessions')
    .select('id')
    .eq('staff_member_id', staff_member_id)
    .eq('business_id', bid)
    .is('clocked_out_at', null)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'Staff member already clocked in' }, { status: 409 });

  const { data, error } = await supabase
    .from('pos_employee_sessions')
    .insert({
      staff_member_id,
      staff_name: staff_name ?? null,
      business_id: bid,
      clocked_in_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { session_id } = await req.json();
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  // Fetch session to compute total_minutes
  const { data: session, error: fetchError } = await supabase
    .from('pos_employee_sessions')
    .select('id, clocked_in_at')
    .eq('id', session_id)
    .eq('business_id', bid)
    .is('clocked_out_at', null)
    .single();

  if (fetchError || !session) return NextResponse.json({ error: 'Open session not found' }, { status: 404 });

  const now = new Date();
  const totalMinutes = Math.round((now.getTime() - new Date(session.clocked_in_at as string).getTime()) / 60000);

  const { data, error } = await supabase
    .from('pos_employee_sessions')
    .update({ clocked_out_at: now.toISOString(), total_minutes: totalMinutes })
    .eq('id', session_id)
    .eq('business_id', bid)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
