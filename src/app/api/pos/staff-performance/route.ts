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

interface SaleRow { served_by: string | null; status: string | null; total_amount: number | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ staff: [], flags: [] });

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await supabase.from('pos_sales')
    .select('served_by, status, total_amount')
    .eq('business_id', bid).gte('created_at', since).limit(10000);

  const rows = (data ?? []) as SaleRow[];
  const perStaff: Record<string, { sales: number; voids: number; refunds: number }> = {};
  for (const r of rows) {
    const name = r.served_by ?? 'Unknown';
    if (!perStaff[name]) perStaff[name] = { sales: 0, voids: 0, refunds: 0 };
    if (r.status === 'voided') perStaff[name].voids++;
    else if (Number(r.total_amount ?? 0) < 0) perStaff[name].refunds++;
    else perStaff[name].sales++;
  }

  const staff = Object.entries(perStaff).map(([name, v]) => ({
    name,
    sales: v.sales,
    voids: v.voids,
    refunds: v.refunds,
    void_rate_pct: v.sales > 0 ? Math.round((v.voids / v.sales) * 1000) / 10 : 0,
  }));
  const avgVoidRate = staff.length > 0 ? staff.reduce((a, s) => a + s.void_rate_pct, 0) / staff.length : 0;
  const flags = staff
    .filter(s => s.sales >= 10 && avgVoidRate > 0 && s.void_rate_pct >= avgVoidRate * 3)
    .map(s => ({ ...s, multiplier_vs_avg: avgVoidRate > 0 ? Math.round((s.void_rate_pct / avgVoidRate) * 10) / 10 : 0 }));

  return NextResponse.json({ staff, flags, avg_void_rate_pct: Math.round(avgVoidRate * 10) / 10 });
}

export const GET = withErrorCapture('pos/staff-performance', _GET);
