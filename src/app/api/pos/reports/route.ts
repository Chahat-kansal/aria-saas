export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { toAESTStart, toAESTEnd } from '@/lib/date-au'
import { REPORTABLE_STATUSES } from '@/lib/pos/revenue'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ summary: null, daily: [] });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? new Date().toISOString().slice(0, 10);

  // INTEL-COMPUTE-2 — status filter was already canonical; boundary was a naive UTC-day string
  // (no offset). toAESTStart/toAESTEnd give the real local trading day, the same canonical boundary
  // getRevenueSnapshot() uses — this feeds RetailDashboard's top-of-page "Revenue today/this week" KPI.
  const { data: sales } = await supabase
    .from('pos_sales')
    .select('id, total_amount, tax_amount, discount_amount, payment_method, created_at, status')
    .eq('business_id', bid)
    .in('status', REPORTABLE_STATUSES)
    .not('sale_number', 'is', null)
    .gte('created_at', toAESTStart(from))
    .lte('created_at', toAESTEnd(to))
    .order('created_at');

  const rows = sales ?? [];
  const totalRevenue = rows.reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const totalTax = rows.reduce((s, r) => s + (r.tax_amount ?? 0), 0);
  const totalDiscount = rows.reduce((s, r) => s + (r.discount_amount ?? 0), 0);
  const cashSales = rows.filter(r => r.payment_method === 'cash').reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const cardSales = rows.filter(r => r.payment_method === 'card').reduce((s, r) => s + (r.total_amount ?? 0), 0);

  // Group by day
  const byDay: Record<string, { date: string; revenue: number; count: number }> = {};
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, revenue: 0, count: 0 };
    byDay[day].revenue += row.total_amount ?? 0;
    byDay[day].count += 1;
  }

  return NextResponse.json({
    summary: {
      total_revenue: totalRevenue, total_tax: totalTax, total_discount: totalDiscount,
      transaction_count: rows.length, cash_sales: cashSales, card_sales: cardSales,
      avg_transaction: rows.length ? totalRevenue / rows.length : 0,
    },
    daily: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
  });
}

export const GET = withErrorCapture('pos/reports', _GET)

