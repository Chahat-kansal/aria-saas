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

interface SaleRow { id: string; total_amount: number | null; payment_method: string | null; created_at: string; served_by: string | null; status: string | null }
interface SessionRow { id: string; opened_at: string; opened_by: string | null; opening_float: number | null; status: string | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [todaySales, openSession, recentSales, posUsersOnline] = await Promise.all([
    supabase.from('pos_sales')
      .select('total_amount, payment_method, status')
      .eq('business_id', bid)
      .gte('created_at', todayStart.toISOString())
      .neq('status', 'voided'),
    supabase.from('pos_cash_sessions')
      .select('id, opened_at, opened_by, opening_float, status')
      .eq('business_id', bid)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('pos_sales')
      .select('id, total_amount, payment_method, created_at, served_by, status')
      .eq('business_id', bid)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('pos_users')
      .select('id, name, last_seen_at')
      .eq('business_id', bid)
      .gte('last_seen_at', new Date(Date.now() - 60 * 60_000).toISOString())
      .limit(20),
  ]);

  const sales = (todaySales.data ?? []) as SaleRow[];
  const revenue = sales.reduce((a, s) => a + Number(s.total_amount ?? 0), 0);
  const txCount = sales.length;
  const avgTicket = txCount > 0 ? revenue / txCount : 0;

  const paymentBreakdown: Record<string, number> = {};
  for (const s of sales) {
    const m = s.payment_method ?? 'cash';
    paymentBreakdown[m] = (paymentBreakdown[m] ?? 0) + Number(s.total_amount ?? 0);
  }

  return NextResponse.json({
    today: { revenue, transactions: txCount, avg_ticket: avgTicket, payment_breakdown: paymentBreakdown },
    open_session: openSession.data as SessionRow | null,
    recent_sales: (recentSales.data ?? []) as SaleRow[],
    staff_online: posUsersOnline.data ?? [],
  });
}

export const GET = withErrorCapture('pos/dashboard', _GET);
