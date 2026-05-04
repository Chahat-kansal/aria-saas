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

  // Use minimal select — avoid columns or FK joins that may not exist in this schema
  const { data: sales, error } = await supabase
    .from('pos_sales')
    .select('id, sale_number, total_amount, tax_amount, discount_amount, payment_method, status, created_at, customer_id, served_by')
    .eq('business_id', bid)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(500);

  // If served_by column causes error, retry without it
  const rows = error ? await (async () => {
    const { data: fallback } = await supabase
      .from('pos_sales')
      .select('id, sale_number, total_amount, tax_amount, discount_amount, payment_method, status, created_at, customer_id')
      .eq('business_id', bid)
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(500);
    return fallback ?? [];
  })() : (sales ?? []);

  // Include ALL statuses — filter out obviously invalid records
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

  return NextResponse.json({ sales: rows, total_revenue_cents, transaction_count, avg_basket_cents, revenue_by_day, by_payment_method: by_method });
}
