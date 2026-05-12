export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, isAdminEmail } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const EVENT_COSTS: Record<string, number> = {
  daily_briefing: 0.018,
  business_chat: 0.006,
  pos_chat: 0.00015,
  social_suggest: 0.015,
  weekly_order: 0.010,
  barcode_lookup: 0.0001,
  page_insight: 0.005,
};

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to   = searchParams.get('to')   || new Date().toISOString().split('T')[0];

  const db = getAdminClient();
  const { data: logs, error } = await db.from('usage_logs').select('event_type,business_id,created_at,metadata')
    .gte('created_at', from).lte('created_at', to + 'T23:59:59Z');

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ by_event: {}, by_business: {}, estimated_cost_usd: 0, total_events: 0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byEvent: Record<string, number> = {};
  const byBusiness: Record<string, { count: number; cost: number }> = {};
  let totalCost = 0;

  for (const log of (logs || [])) {
    byEvent[log.event_type] = (byEvent[log.event_type] || 0) + 1;
    const cost = EVENT_COSTS[log.event_type] || 0;
    totalCost += cost;
    if (!byBusiness[log.business_id]) byBusiness[log.business_id] = { count: 0, cost: 0 };
    byBusiness[log.business_id].count++;
    byBusiness[log.business_id].cost += cost;
  }

  const byEventWithCost = Object.entries(byEvent).map(([event_type, count]) => ({
    event_type, count, est_cost_usd: count * (EVENT_COSTS[event_type] || 0),
  })).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    by_event: byEventWithCost,
    by_business: byBusiness,
    estimated_cost_usd: totalCost,
    total_events: (logs || []).length,
    logs: (logs || []).slice(0, 200),
  });
}

export const GET = withErrorCapture('admin/usage', _GET)
