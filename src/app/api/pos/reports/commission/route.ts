export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { generateInsight } from '@/lib/aria-insights';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { toAESTStart, toAESTEnd } from '@/lib/date-au'
import { REPORTABLE_STATUSES } from '@/lib/pos/revenue'

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
  if (!bid) return NextResponse.json({ rows: [], rules: [], totalRevenue: 0, totalCommission: 0, commissionPct: 0, insight: null });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0];
  const to   = searchParams.get('to')   ?? new Date().toISOString().split('T')[0];

  const [{ data: sales }, { data: rules }] = await Promise.all([
    // INTEL-COMPUTE-2 — was .neq('status','voided') (admits draft/refunded rows into real staff
    // commission payouts) with a naive UTC boundary (no AEST awareness). status='completed' is the
    // same canonical filter getRevenueSnapshot() uses; toAESTStart/toAESTEnd give the real local day.
    supabase
      .from('pos_sales')
      .select('total_amount, served_by')
      .eq('business_id', bid)
      .in('status', REPORTABLE_STATUSES)
      .gte('created_at', toAESTStart(from))
      .lte('created_at', toAESTEnd(to))
      .limit(5000),
    supabase
      .from('pos_commission_rules')
      .select('*')
      .eq('business_id', bid)
      .is('effective_until', null)
      .limit(50),
  ]);

  const ruleList = (rules ?? []) as Array<{ id: string; staff_id: string | null; rule_type: string; rate_pct: number; flat_cents: number; applies_to: string; effective_from: string }>;
  const defaultRule = ruleList.find(r => r.staff_id == null);

  const staffMap = new Map<string, { name: string; total: number }>();
  for (const s of (sales ?? []) as Array<{ total_amount: number; served_by?: string | null }>) {
    const key = (s as any).served_by ?? 'Unknown';
    const e = staffMap.get(key) ?? { name: key, total: 0 };
    e.total += s.total_amount ?? 0;
    staffMap.set(key, e);
  }

  const rows = Array.from(staffMap.values()).map(s => {
    const rule = ruleList.find(r => r.staff_id === s.name) ?? defaultRule;
    const commission = rule ? (s.total * ((rule.rate_pct ?? 0) / 100)) : 0;
    return { name: s.name, total: s.total, rule: rule ? `${rule.rate_pct}% of sale` : 'No rule', commission };
  }).sort((a, b) => b.commission - a.commission);

  const totalRevenue    = rows.reduce((s, r) => s + r.total, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const commissionPct   = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0;

  let insight: { bullets: string[] } | null = null;
  try {
    const top = rows[0];
    const res = await generateInsight({
      business_id: bid,
      context: `commission_report top="${top?.name ?? ''}" commission=${totalCommission.toFixed(0)} pct=${commissionPct.toFixed(1)}`,
      data: { totalRevenue, totalCommission, rows: rows.slice(0, 3) },
      maxBullets: 2,
    });
    insight = { bullets: res.bullets };
  } catch { /* insight is optional */ }

  return NextResponse.json({ rows, rules: ruleList, totalRevenue, totalCommission, commissionPct, insight });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { pos_user_name, status = 'paid' } = body;
  if (!pos_user_name) return NextResponse.json({ error: 'pos_user_name required' }, { status: 400 });

  await supabase.from('pos_commission_rules')
    .update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null })
    .eq('business_id', bid)
    .eq('pos_user_name', pos_user_name)
    .eq('status', 'pending');

  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/reports/commission', _GET)
export const PATCH = withErrorCapture('pos/reports/commission', _PATCH)
