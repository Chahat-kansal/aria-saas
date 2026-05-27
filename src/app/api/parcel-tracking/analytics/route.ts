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

interface ParcelRow { carrier: string | null; carrier_name: string | null; status: string | null; created_at: string; delivered_at: string | null; estimated_delivery: string | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ summary: null });

  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data } = await supabase.from('pos_parcel_tracking')
    .select('carrier, carrier_name, status, created_at, delivered_at, estimated_delivery')
    .eq('business_id', bid)
    .gte('created_at', since)
    .limit(2000);

  const rows = (data ?? []) as ParcelRow[];
  const carriers: Record<string, { name: string; total: number; delivered: number; exceptions: number; days_to_deliver: number[] }> = {};

  for (const p of rows) {
    const key = p.carrier ?? 'other';
    if (!carriers[key]) carriers[key] = { name: p.carrier_name ?? key, total: 0, delivered: 0, exceptions: 0, days_to_deliver: [] };
    carriers[key].total++;
    if (p.status === 'delivered') {
      carriers[key].delivered++;
      if (p.delivered_at) {
        const days = (new Date(p.delivered_at).getTime() - new Date(p.created_at).getTime()) / 86400_000;
        if (days > 0 && days < 60) carriers[key].days_to_deliver.push(Math.round(days * 10) / 10);
      }
    }
    if (p.status === 'exception' || p.status === 'failed' || p.status === 'cancelled') carriers[key].exceptions++;
  }

  const byCarrier = Object.entries(carriers).map(([key, v]) => ({
    carrier: key,
    name: v.name,
    total: v.total,
    delivered: v.delivered,
    exceptions: v.exceptions,
    exception_rate: v.total > 0 ? Math.round((v.exceptions / v.total) * 1000) / 10 : 0,
    avg_days: v.days_to_deliver.length > 0 ? Math.round((v.days_to_deliver.reduce((a, b) => a + b, 0) / v.days_to_deliver.length) * 10) / 10 : null,
  })).sort((a, b) => b.total - a.total);

  // Monthly shipment trend
  const byMonth: Record<string, number> = {};
  for (const p of rows) {
    const m = p.created_at.slice(0, 7);
    byMonth[m] = (byMonth[m] ?? 0) + 1;
  }
  const monthly = Object.entries(byMonth).sort().map(([month, count]) => ({ month, count }));

  // Exception buckets
  const fiveDaysAgo = Date.now() - 5 * 86400_000;
  const stuck = rows.filter(p => p.status !== 'delivered' && p.status !== 'cancelled' && p.status !== 'failed' && new Date(p.created_at).getTime() < fiveDaysAgo).length;
  const failed = rows.filter(p => p.status === 'failed').length;
  const returned = rows.filter(p => p.status === 'returned').length;

  return NextResponse.json({
    summary: {
      total: rows.length,
      by_carrier: byCarrier,
      monthly,
      exceptions: { stuck, failed, returned },
      top_carrier: byCarrier[0]?.name ?? null,
    },
  });
}

export const GET = withErrorCapture('parcel-tracking/analytics', _GET);
