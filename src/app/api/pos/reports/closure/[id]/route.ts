export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: session } = await supabase
    .from('pos_cash_sessions')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify this session belongs to a business owned by the authenticated user
  const sessionBid = (session as any).business_id as string;
  const { data: ownerCheck } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', sessionBid)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!ownerCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const endTime = (session.closed_at as string | null) || new Date().toISOString();

  // Use session.business_id (not the user's first business) — this was the root cause
  const { data: sales } = await supabase
    .from('pos_sales')
    .select('id,total_amount,payment_method,served_by,customer_id,created_at,discount_amount,tax_total')
    .eq('business_id', sessionBid)
    .gte('created_at', session.opened_at as string)
    .lte('created_at', endTime)
    .neq('status', 'voided');

  const saleIds = (sales || []).map((s: any) => s.id);
  const { data: items } = saleIds.length > 0
    ? await supabase.from('pos_sale_items').select('sale_id,quantity,cost_price,unit_price,total_price').in('sale_id', saleIds)
    : { data: [] };

  const itemsBySale = new Map<string, any[]>();
  for (const item of (items || [])) {
    const sid = (item as any).sale_id as string;
    if (!itemsBySale.has(sid)) itemsBySale.set(sid, []);
    itemsBySale.get(sid)!.push(item);
  }

  let revenue = 0, cogs = 0, discounts = 0, tax = 0;
  const paymentTotals: Record<string, number> = {};
  const byCashier: Record<string, { revenue: number; cogs: number; count: number }> = {};
  const byHour: Record<string, { revenue: number; count: number; customers: Set<string> }> = {};

  for (const sale of (sales || [])) {
    const r = (sale as any).total_amount || 0;
    const saleItems = itemsBySale.get((sale as any).id) || [];
    const saleCogs = saleItems.reduce((s: number, i: any) => s + ((i.cost_price || 0) * (i.quantity || 1)), 0);
    revenue += r;
    cogs += saleCogs;
    discounts += (sale as any).discount_amount || 0;
    tax += (sale as any).tax_total || (r * 10 / 110);
    const pm = (sale as any).payment_method || 'cash';
    paymentTotals[pm] = (paymentTotals[pm] || 0) + r;
    const cashier = (sale as any).served_by || 'Unknown';
    if (!byCashier[cashier]) byCashier[cashier] = { revenue: 0, cogs: 0, count: 0 };
    byCashier[cashier].revenue += r;
    byCashier[cashier].cogs += saleCogs;
    byCashier[cashier].count++;
    const h = new Date((sale as any).created_at).toISOString().slice(0, 13);
    if (!byHour[h]) byHour[h] = { revenue: 0, count: 0, customers: new Set() };
    byHour[h].revenue += r;
    byHour[h].count++;
    if ((sale as any).customer_id) byHour[h].customers.add((sale as any).customer_id);
  }

  return NextResponse.json({
    session,
    revenue, cogs, profit: revenue - cogs, tax, discounts,
    transaction_count: (sales || []).length,
    payment_totals: paymentTotals,
    by_cashier: Object.entries(byCashier).map(([name, d]) => ({
      name, revenue: d.revenue, cogs: d.cogs,
      profit: d.revenue - d.cogs,
      profit_percent: d.revenue > 0 ? ((d.revenue - d.cogs) / d.revenue * 100) : 0,
      avg_sale: d.count > 0 ? d.revenue / d.count : 0,
      transaction_count: d.count,
    })),
    hourly: Object.entries(byHour).sort(([a], [b]) => a.localeCompare(b)).map(([h, d]) => ({
      label: `${h.slice(11)}:00`,
      revenue: d.revenue, transactions: d.count,
      customers: d.customers.size,
      avg_sale: d.count > 0 ? d.revenue / d.count : 0,
    })),
  });
}

export const GET = withErrorCapture('pos/reports/closure/[id]', _GET)
