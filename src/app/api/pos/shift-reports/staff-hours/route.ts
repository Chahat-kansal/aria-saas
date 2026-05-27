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

interface TS { staff_name: string | null; hours_worked: number | null; pay_rate_cents: number | null; total_pay_cents: number | null; clock_in: string; clock_out: string | null }
interface Sale { total_amount: number | null; served_by: string | null; created_at: string; status: string | null }

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ staff: [], totals: null });

  const days = Math.min(parseInt(new URL(req.url).searchParams.get('days') ?? '7'), 90);
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data: timesheets } = await supabase.from('pos_timesheets')
    .select('staff_name, hours_worked, pay_rate_cents, total_pay_cents, clock_in, clock_out')
    .eq('business_id', bid)
    .gte('clock_in', since)
    .limit(2000);

  const { data: sales } = await supabase.from('pos_sales')
    .select('total_amount, served_by, created_at, status')
    .eq('business_id', bid)
    .gte('created_at', since)
    .limit(5000);

  const ts = (timesheets ?? []) as TS[];
  const sl = ((sales ?? []) as Sale[]).filter(s => s.status !== 'voided');

  const perStaff: Record<string, { name: string; hours: number; pay_cents: number; revenue: number; sessions: number }> = {};
  for (const t of ts) {
    const name = t.staff_name ?? 'Unknown';
    if (!perStaff[name]) perStaff[name] = { name, hours: 0, pay_cents: 0, revenue: 0, sessions: 0 };
    perStaff[name].hours += Number(t.hours_worked ?? 0);
    perStaff[name].pay_cents += Number(t.total_pay_cents ?? (Number(t.pay_rate_cents ?? 0) * Number(t.hours_worked ?? 0)));
    perStaff[name].sessions++;
  }
  for (const s of sl) {
    const name = s.served_by ?? null;
    if (!name) continue;
    if (!perStaff[name]) perStaff[name] = { name, hours: 0, pay_cents: 0, revenue: 0, sessions: 0 };
    perStaff[name].revenue += Number(s.total_amount ?? 0);
  }

  // Per-week hours for overtime flag (Australian Fair Work standard 38hrs)
  const perStaffWeek: Record<string, Record<string, number>> = {};
  for (const t of ts) {
    if (!t.staff_name) continue;
    const date = new Date(t.clock_in);
    const monday = new Date(date);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const wk = monday.toISOString().slice(0, 10);
    if (!perStaffWeek[t.staff_name]) perStaffWeek[t.staff_name] = {};
    perStaffWeek[t.staff_name][wk] = (perStaffWeek[t.staff_name][wk] ?? 0) + Number(t.hours_worked ?? 0);
  }
  const overtime: Record<string, { week: string; hours: number }[]> = {};
  for (const [name, weeks] of Object.entries(perStaffWeek)) {
    overtime[name] = Object.entries(weeks).filter(([_, h]) => h > 38).map(([week, hours]) => ({ week, hours }));
  }

  const staff = Object.values(perStaff).map(s => ({
    name: s.name,
    hours: Math.round(s.hours * 10) / 10,
    pay_dollars: Math.round(s.pay_cents / 100 * 100) / 100,
    revenue: Math.round(s.revenue * 100) / 100,
    revenue_per_hour: s.hours > 0 ? Math.round((s.revenue / s.hours) * 100) / 100 : 0,
    sessions: s.sessions,
    overtime_weeks: overtime[s.name] ?? [],
  })).sort((a, b) => b.hours - a.hours);

  const totals = {
    hours: Math.round(staff.reduce((a, s) => a + s.hours, 0) * 10) / 10,
    pay_dollars: Math.round(staff.reduce((a, s) => a + s.pay_dollars, 0) * 100) / 100,
    revenue: Math.round(staff.reduce((a, s) => a + s.revenue, 0) * 100) / 100,
  };

  return NextResponse.json({ staff, totals, days });
}

export const GET = withErrorCapture('shift-reports/staff-hours', _GET);
