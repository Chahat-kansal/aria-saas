export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { REPORTABLE_STATUSES } from '@/lib/pos/revenue'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ total_labour_dollars: 0, total_revenue: 0, labour_pct: null, by_staff: [], days: 7 });

  const days = Math.min(parseInt(new URL(req.url).searchParams.get('days') ?? '7'), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [tsRes, staffRes, salesRes] = await Promise.all([
    supabaseAdmin
      .from('pos_timesheets')
      .select('staff_member_id, staff_name, hours_worked, total_pay_cents, pay_rate_cents')
      .eq('business_id', bid)
      .gte('clock_in', since)
      .limit(2000),
    supabaseAdmin
      .from('staff_members')
      .select('id, first_name, last_name')
      .eq('business_id', bid),
    supabaseAdmin
      .from('pos_sales')
      .select('total_amount')
      .eq('business_id', bid)
      .gte('created_at', since)
      .in('status', REPORTABLE_STATUSES)
      .limit(5000),
  ]);

  const timesheets = (tsRes.data ?? []) as Array<{
    staff_member_id: string | null;
    staff_name: string | null;
    hours_worked: number | null;
    total_pay_cents: number | null;
    pay_rate_cents: number | null;
  }>;

  // Build staff name map: id → "First Last"
  const nameMap: Record<string, string> = {};
  for (const s of (staffRes.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    nameMap[s.id] = [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Unknown';
  }

  // Aggregate per staff member
  const perStaff: Record<string, { name: string; hours: number; pay_cents: number }> = {};
  for (const t of timesheets) {
    const name = (t.staff_member_id ? nameMap[t.staff_member_id] : null) ?? t.staff_name ?? 'Unknown';
    if (!perStaff[name]) perStaff[name] = { name, hours: 0, pay_cents: 0 };
    perStaff[name].hours += Number(t.hours_worked ?? 0);
    perStaff[name].pay_cents += Number(
      t.total_pay_cents ?? (Number(t.pay_rate_cents ?? 0) * Number(t.hours_worked ?? 0))
    );
  }

  const by_staff = Object.values(perStaff)
    .map(s => ({
      name: s.name,
      hours: Math.round(s.hours * 10) / 10,
      pay_dollars: Math.round(s.pay_cents / 100 * 100) / 100,
    }))
    .sort((a, b) => b.pay_dollars - a.pay_dollars);

  const total_labour_dollars = Math.round(by_staff.reduce((s, x) => s + x.pay_dollars, 0) * 100) / 100;
  const total_revenue = Math.round(
    (salesRes.data ?? []).reduce((s, x) => s + Number(x.total_amount ?? 0), 0) * 100
  ) / 100;
  const labour_pct = total_revenue > 0
    ? Math.round((total_labour_dollars / total_revenue) * 1000) / 10
    : null;

  // Aria Intelligence: labour > 30% → upsert action
  if (labour_pct != null && labour_pct > 30 && total_revenue >= 100) {
    upsertAriaAction({
      business_id: bid,
      category: 'staff',
      title: `Labour cost is ${labour_pct.toFixed(1)}% of revenue this week`,
      recommendation: 'Review roster hours — labour above 30% of revenue reduces profitability.',
      reason: `Last ${days} days: A$${total_labour_dollars.toFixed(2)} labour on A$${total_revenue.toFixed(2)} revenue.`,
      expected_impact: 'Reducing labour to 30% would save A$' + Math.max(0, (total_labour_dollars - total_revenue * 0.3)).toFixed(2) + ' this period.',
      priority: 'high',
      status: 'pending',
      source: 'labour_this_week',
      triggered_by: 'labour_this_week',
    }).catch(() => {});
  }

  return NextResponse.json({ total_labour_dollars, total_revenue, labour_pct, by_staff, days });
}

export const GET = withErrorCapture('shift-reports/labour-this-week', _GET);
