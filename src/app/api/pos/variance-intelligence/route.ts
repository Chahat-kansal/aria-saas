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

interface SessionRow { variance_cents: number | null; closed_at: string | null; closed_by: string | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ patterns: [] });

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await supabase.from('pos_cash_sessions')
    .select('variance_cents, closed_at, closed_by')
    .eq('business_id', bid).eq('status', 'closed')
    .gte('closed_at', since);

  const rows = (data ?? []) as SessionRow[];
  if (rows.length === 0) return NextResponse.json({ patterns: [] });

  const perStaff: Record<string, { sessions: number; total_variance_cents: number; high_variance_count: number }> = {};
  let allVariance = 0;
  for (const r of rows) {
    const staff = r.closed_by ?? 'Unknown';
    if (!perStaff[staff]) perStaff[staff] = { sessions: 0, total_variance_cents: 0, high_variance_count: 0 };
    const v = Math.abs(Number(r.variance_cents ?? 0));
    perStaff[staff].sessions++;
    perStaff[staff].total_variance_cents += v;
    if (v > 500) perStaff[staff].high_variance_count++;
    allVariance += v;
  }
  const avg = allVariance / rows.length;

  const patterns = Object.entries(perStaff)
    .filter(([, s]) => s.sessions >= 3)
    .map(([staff, s]) => ({
      staff,
      sessions: s.sessions,
      avg_variance_cents: Math.round(s.total_variance_cents / s.sessions),
      high_variance_sessions: s.high_variance_count,
      multiplier_vs_avg: avg > 0 ? Math.round((s.total_variance_cents / s.sessions / avg) * 10) / 10 : 0,
    }))
    .filter(p => p.multiplier_vs_avg >= 2)
    .sort((a, b) => b.multiplier_vs_avg - a.multiplier_vs_avg);

  return NextResponse.json({ patterns, baseline_avg_variance_cents: Math.round(avg), sessions_analysed: rows.length });
}

export const GET = withErrorCapture('pos/variance-intelligence', _GET);
