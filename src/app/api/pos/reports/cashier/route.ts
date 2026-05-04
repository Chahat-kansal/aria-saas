export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0];
  const to   = searchParams.get('to')   ?? new Date().toISOString().split('T')[0];

  // Try with served_by first, fall back without it
  let sales: Array<{ total_amount: number; payment_method: string; status: string; served_by?: string | null }> = [];
  const { data, error } = await supabase
    .from('pos_sales')
    .select('total_amount, payment_method, status, served_by')
    .eq('business_id', bid)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .limit(2000);

  if (error) {
    // served_by column may not exist — retry without it
    const { data: fallback } = await supabase
      .from('pos_sales')
      .select('total_amount, payment_method, status')
      .eq('business_id', bid)
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .limit(2000);
    sales = fallback ?? [];
  } else {
    sales = data ?? [];
  }

  // Group by cashier name
  const cashierMap = new Map<string, { name: string; sales_count: number; revenue: number; cash_sales: number; card_sales: number; refunds: number }>();

  for (const s of sales) {
    const name = (s as any).served_by || 'Unassigned';
    const existing = cashierMap.get(name) ?? { name, sales_count: 0, revenue: 0, cash_sales: 0, card_sales: 0, refunds: 0 };
    const amt = s.total_amount ?? 0;
    if (amt < 0 || s.status === 'refunded') {
      existing.refunds += Math.abs(amt);
    } else {
      existing.sales_count++;
      existing.revenue += amt;
      if (s.payment_method === 'cash') existing.cash_sales += amt;
      else existing.card_sales += amt;
    }
    cashierMap.set(name, existing);
  }

  const by_cashier = Array.from(cashierMap.values())
    .map(r => ({ ...r, avg_basket: r.sales_count > 0 ? r.revenue / r.sales_count : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const totals = {
    total_revenue:  by_cashier.reduce((s, r) => s + r.revenue, 0),
    total_sales:    by_cashier.reduce((s, r) => s + r.sales_count, 0),
    cashier_count:  by_cashier.length,
  };

  return NextResponse.json({ by_cashier, totals });
}
