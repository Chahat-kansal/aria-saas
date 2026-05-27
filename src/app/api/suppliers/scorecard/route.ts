export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface PoRow { id: string; supplier_id: string | null; status: string | null; created_at: string; expected_at: string | null; received_at: string | null; total_amount: number | null; pos_suppliers: { name: string | null } | null }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ suppliers: [] });

  const since = new Date(Date.now() - 180 * 86400_000).toISOString();
  const { data: pos } = await supabase.from('pos_purchase_orders')
    .select('id, supplier_id, status, created_at, expected_at, received_at, total_amount, pos_suppliers(name)')
    .eq('business_id', bid)
    .gte('created_at', since)
    .limit(2000);

  const rows = (pos ?? []) as unknown as PoRow[];

  const per: Record<string, { id: string; name: string; total_orders: number; received: number; on_time: number; lead_days: number[]; spend_month_cents: number; spend_year_cents: number }> = {};
  const monthAgo = Date.now() - 30 * 86400_000;
  const yearAgo = Date.now() - 365 * 86400_000;

  for (const r of rows) {
    const sid = r.supplier_id ?? 'unknown';
    if (!per[sid]) per[sid] = { id: sid, name: r.pos_suppliers?.name ?? 'Unknown', total_orders: 0, received: 0, on_time: 0, lead_days: [], spend_month_cents: 0, spend_year_cents: 0 };
    per[sid].total_orders++;
    const ts = new Date(r.created_at).getTime();
    const cents = Math.round(Number(r.total_amount ?? 0) * 100);
    if (ts >= yearAgo) per[sid].spend_year_cents += cents;
    if (ts >= monthAgo) per[sid].spend_month_cents += cents;
    if (r.received_at) {
      per[sid].received++;
      const days = (new Date(r.received_at).getTime() - ts) / 86400_000;
      if (days > 0 && days < 365) per[sid].lead_days.push(days);
      if (r.expected_at) {
        const expected = new Date(r.expected_at).getTime();
        if (new Date(r.received_at).getTime() <= expected) per[sid].on_time++;
      }
    }
  }

  const suppliers = Object.values(per).map(s => ({
    id: s.id,
    name: s.name,
    total_orders: s.total_orders,
    received: s.received,
    fulfilment_rate: s.total_orders > 0 ? Math.round((s.received / s.total_orders) * 100) : 0,
    on_time_rate: s.received > 0 ? Math.round((s.on_time / s.received) * 100) : 0,
    avg_lead_days: s.lead_days.length > 0 ? Math.round((s.lead_days.reduce((a, b) => a + b, 0) / s.lead_days.length) * 10) / 10 : null,
    spend_month: Math.round(s.spend_month_cents / 100 * 100) / 100,
    spend_year: Math.round(s.spend_year_cents / 100 * 100) / 100,
  })).sort((a, b) => (b.on_time_rate ?? 0) - (a.on_time_rate ?? 0));

  return NextResponse.json({ suppliers });
}

export const GET = withErrorCapture('suppliers/scorecard', _GET);
