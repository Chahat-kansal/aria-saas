export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { generateInsight } from '@/lib/aria-insights';

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
  if (!bid) return NextResponse.json({ rows: [], insight: null });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0];
  const to   = searchParams.get('to')   ?? new Date().toISOString().split('T')[0];

  const { data: sales, error } = await supabase
    .from('pos_sales')
    .select('total_amount, payment_method, status, served_by, discount_amount')
    .eq('business_id', bid)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .limit(2000);

  let saleRows: Array<{ total_amount: number; payment_method: string; status: string; served_by?: string | null; discount_amount?: number | null }> = [];
  if (error) {
    const { data: fallback } = await supabase
      .from('pos_sales')
      .select('total_amount, payment_method, status, discount_amount')
      .eq('business_id', bid)
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .limit(2000);
    saleRows = fallback ?? [];
  } else {
    saleRows = sales ?? [];
  }

  // Also load action log for voids / no-sale-opens
  const { data: actionLogRaw } = await supabase
    .from('pos_action_log')
    .select('action_type, user_id')
    .eq('business_id', bid)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .in('action_type', ['void', 'refund', 'no_sale_open', 'discount_apply'])
    .limit(2000);
  const actionLog = actionLogRaw ?? [];

  const cashierMap = new Map<string, {
    name: string; sales: number; transactions: number;
    voids: number; refunds: number; noSaleOpens: number; discountTotal: number;
  }>();

  for (const s of saleRows) {
    const key = (s as any).served_by ?? 'Unknown';
    const e = cashierMap.get(key) ?? { name: key, sales: 0, transactions: 0, voids: 0, refunds: 0, noSaleOpens: 0, discountTotal: 0 };
    const amt = s.total_amount ?? 0;
    if (amt >= 0 && s.status !== 'voided' && s.status !== 'refunded') {
      e.sales += amt;
      e.transactions += 1;
    } else if (s.status === 'refunded') {
      e.refunds += 1;
    }
    e.discountTotal += (s as any).discount_amount ?? 0;
    cashierMap.set(key, e);
  }

  for (const a of (actionLog as Array<{ action_type: string; user_id: string }>)) {
    const key = a.user_id ?? 'Unknown';
    const e = cashierMap.get(key) ?? { name: key, sales: 0, transactions: 0, voids: 0, refunds: 0, noSaleOpens: 0, discountTotal: 0 };
    if (a.action_type === 'void') e.voids += 1;
    else if (a.action_type === 'refund') e.refunds += 1;
    else if (a.action_type === 'no_sale_open') e.noSaleOpens += 1;
    cashierMap.set(key, e);
  }

  const rows = Array.from(cashierMap.values())
    .map(r => ({ ...r, avg_sale: r.transactions > 0 ? r.sales / r.transactions : 0 }))
    .sort((a, b) => b.sales - a.sales);

  let insight: { bullets: string[] } | null = null;
  try {
    const top = rows[0];
    const res = await generateInsight({
      business_id: bid,
      context: `cashier_report top_cashier="${top?.name ?? ''}" revenue=${top?.sales ?? 0} transactions=${top?.transactions ?? 0}`,
      data: { rows: rows.slice(0, 3) },
      maxBullets: 2,
    });
    insight = { bullets: res.bullets };
  } catch { /* insight is optional */ }

  return NextResponse.json({ rows, insight });
}
