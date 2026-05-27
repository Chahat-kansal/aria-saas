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

interface SaleRow { total_amount: number | null; created_at: string; status: string | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ status: 'ok', message: 'No business' });

  const now = new Date();
  const hour = now.getHours();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86400_000);

  // Current hour revenue (today)
  const todayStart = new Date(now); todayStart.setHours(hour, 0, 0, 0);
  const hourEnd = new Date(now); hourEnd.setHours(hour, 59, 59, 999);
  const { data: currentSales } = await supabase.from('pos_sales')
    .select('total_amount, created_at, status')
    .eq('business_id', bid).neq('status', 'voided')
    .gte('created_at', todayStart.toISOString()).lte('created_at', hourEnd.toISOString());
  const currentRev = (currentSales ?? []).reduce((a, s: SaleRow) => a + Math.max(0, Number(s.total_amount ?? 0)), 0);

  // Same hour over last 4 weeks
  const { data: pastSales } = await supabase.from('pos_sales')
    .select('total_amount, created_at, status')
    .eq('business_id', bid).neq('status', 'voided')
    .gte('created_at', fourWeeksAgo.toISOString())
    .lt('created_at', todayStart.toISOString());
  const sameHourSales = ((pastSales ?? []) as SaleRow[]).filter(s => {
    const d = new Date(s.created_at);
    return d.getHours() === hour && d.getDay() === now.getDay();
  });
  const weeks = Math.max(1, Math.ceil(sameHourSales.length / 10));
  const avgRev = sameHourSales.reduce((a, s) => a + Math.max(0, Number(s.total_amount ?? 0)), 0) / weeks;

  // Staff currently clocked in
  const { data: timesheets } = await supabase.from('pos_timesheets')
    .select('staff_name, pay_rate_cents')
    .eq('business_id', bid).is('clock_out', null);
  const staffCount = (timesheets ?? []).length;
  const avgRateCents = timesheets && timesheets.length > 0
    ? timesheets.reduce((a, t: { pay_rate_cents: number | null }) => a + Number(t.pay_rate_cents ?? 0), 0) / timesheets.length
    : 3500;

  const expected = avgRev > 200 ? Math.max(2, Math.round(avgRev / 100)) : avgRev > 80 ? 2 : 1;
  let status: 'overstaffed' | 'understaffed' | 'ok' = 'ok';
  let message = '';
  let estimated_saving = 0;

  if (avgRev > 50 && currentRev < avgRev * 0.6 && staffCount > expected) {
    status = 'overstaffed';
    const excess = staffCount - expected;
    estimated_saving = Math.round((avgRateCents / 100) * excess);
    message = `Quiet period — you have ${staffCount} staff on, ${expected} would cover it (~A$${estimated_saving}/hr saving)`;
  } else if (avgRev > 100 && currentRev > avgRev * 1.5 && staffCount < expected) {
    status = 'understaffed';
    message = `Busy spike — running ${staffCount} staff, history says ${expected} for this hour`;
  } else {
    message = 'Staffing looks right for this hour';
  }

  return NextResponse.json({ status, message, estimated_saving, current_revenue: Math.round(currentRev * 100) / 100, avg_revenue: Math.round(avgRev * 100) / 100, staff_count: staffCount, expected_staff: expected });
}

export const GET = withErrorCapture('pos/live-staffing', _GET);
