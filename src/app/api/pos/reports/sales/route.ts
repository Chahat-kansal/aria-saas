export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { toAESTStart, toAESTEnd } from '@/lib/date-au'
import { REPORTABLE_STATUSES } from '@/lib/pos/revenue'

async function _GET(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0];
  const to   = searchParams.get('to')   ?? new Date().toISOString().split('T')[0];
  const reportType = searchParams.get('report_type') ?? 'outlet';
  const sessionId  = searchParams.get('session_id') ?? null;

  // INTEL-COMPUTE-2 — was neq('voided') (admits draft/refunded rows into the flagship Sales Report)
  // with a naive UTC-day boundary. status='completed' + toAESTStart/toAESTEnd is the same canonical
  // rule getRevenueSnapshot() uses.
  let query = supabase
    .from('pos_sales')
    .select('id, sale_number, total_amount, tax_amount, discount_amount, payment_method, status, created_at, customer_id, served_by')
    .eq('business_id', bid)
    .not('sale_number', 'is', null)
    .in('status', REPORTABLE_STATUSES)
    .gte('created_at', toAESTStart(from))
    .lte('created_at', toAESTEnd(to))
    .order('created_at', { ascending: false })
    .limit(500);

  // Filter by session if requested
  if (sessionId) {
    query = (query as any).eq('session_id', sessionId);
  }

  const { data: sales, error } = await query;

  // If served_by column causes error, retry without it
  const rows = error ? await (async () => {
    let fb = supabase
      .from('pos_sales')
      .select('id, sale_number, total_amount, tax_amount, discount_amount, payment_method, status, created_at, customer_id')
      .eq('business_id', bid)
      .in('status', REPORTABLE_STATUSES)
      .gte('created_at', toAESTStart(from))
      .lte('created_at', toAESTEnd(to))
      .order('created_at', { ascending: false })
      .limit(500);
    if (sessionId) fb = (fb as any).eq('session_id', sessionId);
    const { data: fallback } = await fb;
    return fallback ?? [];
  })() : (sales ?? []);

  // Both queries above already filter to status='completed' — this just drops obviously invalid records
  const valid = rows.filter(s => (s.total_amount ?? 0) !== 0 || s.status !== null);

  const total_revenue_cents = Math.round(valid.reduce((s, r) => s + (r.total_amount ?? 0), 0) * 100);
  const transaction_count   = valid.length;
  const avg_basket_cents    = transaction_count > 0 ? Math.round(total_revenue_cents / transaction_count) : 0;

  // Revenue by day
  const byDay: Record<string, number> = {};
  for (const s of valid) {
    const day = (s.created_at as string).slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + (s.total_amount ?? 0);
  }
  const revenue_by_day = Object.entries(byDay)
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Payment breakdown
  const by_method: Record<string, { count: number; total: number }> = {};
  for (const s of valid) {
    const m = s.payment_method ?? 'other';
    if (!by_method[m]) by_method[m] = { count: 0, total: 0 };
    by_method[m].count++;
    by_method[m].total += s.total_amount ?? 0;
  }

  // Grouping by report_type
  let grouped: Record<string, { key: string; name: string; count: number; total: number }> = {};

  if (reportType === 'user') {
    for (const s of valid) {
      const k = (s as any).served_by ?? 'Unknown';
      if (!grouped[k]) grouped[k] = { key: k, name: k, count: 0, total: 0 };
      grouped[k].count++;
      grouped[k].total += s.total_amount ?? 0;
    }
  } else if (reportType === 'customer') {
    for (const s of valid) {
      const k = (s as any).customer_id ?? 'Walk-in';
      if (!grouped[k]) grouped[k] = { key: k, name: k, count: 0, total: 0 };
      grouped[k].count++;
      grouped[k].total += s.total_amount ?? 0;
    }
  } else if (reportType === 'product' || reportType === 'category') {
    // Need to join pos_sale_items — fetch them for the same period
    const saleIds = valid.map(s => s.id);
    if (saleIds.length > 0) {
      const chunkSize = 100;
      const allItems: Array<{ sale_id: string; product_name: string; category: string; quantity: number; unit_price: number }> = [];
      for (let i = 0; i < saleIds.length; i += chunkSize) {
        const chunk = saleIds.slice(i, i + chunkSize);
        const { data: items } = await supabase
          .from('pos_sale_items')
          .select('sale_id, product_name, category, quantity, unit_price')
          .in('sale_id', chunk);
        if (items) allItems.push(...(items as typeof allItems));
      }
      for (const item of allItems) {
        const k = reportType === 'product'
          ? ((item.product_name as string | null) ?? 'Unknown Product')
          : ((item.category as string | null) ?? 'Uncategorised');
        if (!grouped[k]) grouped[k] = { key: k, name: k, count: 0, total: 0 };
        grouped[k].count += item.quantity ?? 1;
        grouped[k].total += ((item.unit_price ?? 0) * (item.quantity ?? 1));
      }
    }
  } else {
    // outlet / default — aggregate all into a single row
    const totalRev = valid.reduce((s, r) => s + (r.total_amount ?? 0), 0);
    grouped['all'] = { key: 'all', name: 'All Sales', count: valid.length, total: totalRev };
  }

  const grouped_rows = Object.values(grouped)
    .map(g => ({ ...g, revenue: g.total, transaction_count: g.count, avg_sale: g.count > 0 ? g.total / g.count : 0 }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ sales: rows, total_revenue_cents, transaction_count, avg_basket_cents, revenue_by_day, by_payment_method: by_method, grouped_rows, report_type: reportType });
}

export const GET = withBusinessContext('pos/reports/sales', _GET)

