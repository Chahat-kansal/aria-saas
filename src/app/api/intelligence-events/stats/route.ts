export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface EventRow { severity: string | null; event_type: string | null; acknowledged: boolean | null; triggered_at: string; acknowledged_at: string | null }

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const business_id = new URL(req.url).searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await supabase.from('intelligence_events')
    .select('severity, event_type, acknowledged, triggered_at, acknowledged_at')
    .eq('business_id', business_id)
    .gte('triggered_at', since)
    .limit(1000);

  const rows = (data ?? []) as EventRow[];
  const total = rows.length;
  const resolved = rows.filter(r => r.acknowledged).length;
  const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // Most common type
  const typeCount: Record<string, number> = {};
  for (const r of rows) {
    const t = r.event_type ?? 'unknown';
    typeCount[t] = (typeCount[t] ?? 0) + 1;
  }
  const mostCommon = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0] ?? null;

  // Weekly buckets
  const weekly: Record<string, { generated: number; resolved: number }> = {};
  for (const r of rows) {
    const d = new Date(r.triggered_at);
    const monday = new Date(d);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const wk = monday.toISOString().slice(0, 10);
    if (!weekly[wk]) weekly[wk] = { generated: 0, resolved: 0 };
    weekly[wk].generated++;
    if (r.acknowledged) weekly[wk].resolved++;
  }
  const series = Object.entries(weekly).sort().map(([week, v]) => ({ week, ...v }));

  return NextResponse.json({
    total, resolved, resolution_rate: rate,
    most_common: mostCommon ? { type: mostCommon[0], count: mostCommon[1] } : null,
    weekly: series,
  });
}

export const GET = withErrorCapture('intelligence-events/stats', _GET);
