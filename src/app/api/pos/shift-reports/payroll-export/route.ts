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

interface TS { staff_name: string | null; hours_worked: number | null; pay_rate_cents: number | null; total_pay_cents: number | null; clock_in: string; clock_out: string | null; overtime_cents: number | null }

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return new NextResponse('No business', { status: 400 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) return NextResponse.json({ error: 'from and to required (YYYY-MM-DD)' }, { status: 400 });

  const { data } = await supabase.from('pos_timesheets')
    .select('staff_name, hours_worked, pay_rate_cents, total_pay_cents, clock_in, clock_out, overtime_cents')
    .eq('business_id', bid)
    .gte('clock_in', from)
    .lte('clock_in', to + 'T23:59:59')
    .order('staff_name', { ascending: true });

  const ts = (data ?? []) as TS[];

  // Aggregate per staff for STP-style summary
  const perStaff: Record<string, { name: string; hours: number; gross_cents: number; overtime_cents: number; rate_cents: number }> = {};
  for (const t of ts) {
    const name = t.staff_name ?? 'Unknown';
    if (!perStaff[name]) perStaff[name] = { name, hours: 0, gross_cents: 0, overtime_cents: 0, rate_cents: Number(t.pay_rate_cents ?? 0) };
    perStaff[name].hours += Number(t.hours_worked ?? 0);
    perStaff[name].gross_cents += Number(t.total_pay_cents ?? Number(t.pay_rate_cents ?? 0) * Number(t.hours_worked ?? 0));
    perStaff[name].overtime_cents += Number(t.overtime_cents ?? 0);
  }

  const rows = [
    ['Staff Name', 'Total Hours', 'Hourly Rate (A$)', 'Overtime (A$)', 'Gross Pay (A$)', 'Period Start', 'Period End'],
    ...Object.values(perStaff).map(s => [
      s.name,
      s.hours.toFixed(2),
      (s.rate_cents / 100).toFixed(2),
      (s.overtime_cents / 100).toFixed(2),
      (s.gross_cents / 100).toFixed(2),
      from,
      to,
    ]),
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-${from}-to-${to}.csv"`,
    },
  });
}

export const GET = withErrorCapture('shift-reports/payroll-export', _GET);
