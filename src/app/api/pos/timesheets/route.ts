export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { computeHours } from '@/lib/staff/timesheets'
import { resolveHourlyRateCents } from '@/lib/staff/pay-rates'

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

  const body = await req.json();
  let { staff_id } = body as { staff_id?: string }
  const { staff_name } = body as { staff_name?: string }

  // INTEL-COMPUTE-1 — the real caller of this route (dashboard/staff/page.tsx's ClockWidget) only
  // ever sends staff_name, never staff_id — every clock-in attempt through it previously failed
  // outright with "staff_id required". pos_timesheets.staff_id has no FK constraint (confirmed live
  // via information_schema), so resolving a real staff_members row by name and using its id is a
  // safe, additive fix rather than a schema change. This is also what makes it possible to resolve
  // a REAL pay rate below instead of leaving pay_rate_cents unset (the exact inverse of the
  // PAYROLL-HOURS-FIX-1 bug: that one produced correct pay/0 hours, this path was producing
  // 0 pay/correct hours for any shift clocked in here).
  let resolvedStaffMemberId: string | null = null
  if (!staff_id) {
    if (!staff_name?.trim()) return NextResponse.json({ error: 'staff_name or staff_id required' }, { status: 400 });
    const { data: members } = await supabase.from('staff_members')
      .select('id, first_name, last_name').eq('business_id', bid).eq('status', 'active')
    const match = (members ?? []).find(m => `${m.first_name} ${m.last_name}`.trim().toLowerCase() === staff_name.trim().toLowerCase())
    if (!match) {
      return NextResponse.json({ error: `No active staff member named "${staff_name.trim()}" found for this business — ask your manager to add you in Staff settings first.` }, { status: 404 });
    }
    staff_id = match.id
    resolvedStaffMemberId = match.id
  } else {
    // Caller supplied a real staff_id directly (e.g. a future picker-based caller) — still resolve
    // its staff_member_id for the rate lookup below if it happens to already be one.
    resolvedStaffMemberId = staff_id
  }

  // Check for existing open session
  const { data: existing } = await supabase
    .from('pos_timesheets')
    .select('id')
    .eq('staff_id', staff_id)
    .eq('business_id', bid)
    .is('clock_out', null)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'Staff member already clocked in' }, { status: 409 });

  const payRateCents = resolvedStaffMemberId
    ? await resolveHourlyRateCents(bid, resolvedStaffMemberId, new Date(), new Date().toTimeString().slice(0, 5))
    : 0

  const { data, error } = await supabase
    .from('pos_timesheets')
    .insert({
      staff_id,
      staff_member_id: resolvedStaffMemberId,
      staff_name: staff_name ?? null,
      business_id: bid,
      clock_in: new Date().toISOString(),
      pay_rate_cents: payRateCents,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data, pay_rate_resolved: payRateCents > 0 });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  const { session_id, break_minutes } = body;
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  // Approval: manager approves a completed timesheet
  if (body.approve) {
    const { error } = await supabase.from('pos_timesheets')
      .update({ approved: true, approved_at: new Date().toISOString(), status: 'approved' })
      .eq('id', session_id).eq('business_id', bid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Fetch session to verify it's open
  const { data: session, error: fetchError } = await supabase
    .from('pos_timesheets')
    .select('id, clock_in, pay_rate_cents')
    .eq('id', session_id)
    .eq('business_id', bid)
    .is('clock_out', null)
    .single();

  if (fetchError || !session) return NextResponse.json({ error: 'Open session not found' }, { status: 404 });

  const now = new Date();
  const breakMins = break_minutes !== undefined ? Number(break_minutes) : 0;
  const clockOutTime = now.toISOString();
  const hoursWorked = computeHours(String(session.clock_in), clockOutTime, breakMins);
  const totalPayCents = Math.round(hoursWorked * (Number(session.pay_rate_cents) || 0));

  const updates: Record<string, unknown> = {
    clock_out: clockOutTime,
    break_minutes: breakMins,
    hours_worked: hoursWorked,
    total_pay_cents: totalPayCents,
    status: 'pending',
  };

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