export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function getBid(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
): Promise<string | null> {
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

type Grade = 'A' | 'B' | 'C' | 'D';

/** Wraps a Supabase count query; returns 0 on any error. */
async function safeCount(
  query: Promise<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const result = await query;
    if (result.error) return 0;
    return result.count ?? 0;
  } catch {
    return 0;
  }
}

export const GET = withErrorCapture('aria/business-health-quick', async (req: Request) => {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const businessId =
    searchParams.get('business_id') ?? (await getBid(supabase, user.id));
  if (!businessId) {
    return NextResponse.json({ error: 'No active business found' }, { status: 404 });
  }

  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  let score = 100;
  const issues: string[] = [];

  // Typed fallback shape for row queries
  type StockRow = { stock_quantity: number | null; low_stock_threshold: number | null };
  type CustomerRow = { last_visit: string | null };
  type SaleRow = { total_amount: number | null };

  const emptyData = <T>(): { data: T[] | null; error: Error } => ({
    data: null,
    error: new Error('fetch failed'),
  });

  // Run all queries in parallel — each wrapped in async IIFE to avoid PromiseLike .catch issues
  const [stockResult, customersResult, unansweredCount, expiringStaffCount, currentSalesResult, previousSalesResult] =
    await Promise.all([
      (async () => { try { const r = await supabase.from('pos_products').select('stock_quantity, low_stock_threshold').eq('business_id', businessId).eq('track_stock', true).eq('is_active', true); return { data: r.data as StockRow[] | null, error: r.error }; } catch { return emptyData<StockRow>(); } })(),
      (async () => { try { const r = await supabase.from('pos_customers').select('last_visit').eq('business_id', businessId); return { data: r.data as CustomerRow[] | null, error: r.error }; } catch { return emptyData<CustomerRow>(); } })(),
      (async () => { try { const r = await supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('business_id', businessId).is('response', null); return r.count ?? 0; } catch { return 0; } })(),
      (async () => { try { const r = await supabase.from('staff_members').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'active').lte('visa_expiry_date', thirtyDaysFromNow); return r.count ?? 0; } catch { return 0; } })(),
      (async () => { try { const r = await supabase.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', sevenDaysAgo); return { data: r.data as SaleRow[] | null, error: r.error }; } catch { return emptyData<SaleRow>(); } })(),
      (async () => { try { const r = await supabase.from('pos_sales').select('total_amount').eq('business_id', businessId).gte('created_at', fourteenDaysAgo).lt('created_at', sevenDaysAgo); return { data: r.data as SaleRow[] | null, error: r.error }; } catch { return emptyData<SaleRow>(); } })(),
    ]);

  // --- Check 1: Out-of-stock products (deduct 10 each, max -30) ---
  if (!stockResult.error && stockResult.data) {
    const stockData = stockResult.data as StockRow[];
    const outOfStock = stockData.filter(
      (p) => (p.stock_quantity ?? 0) <= 0,
    ).length;
    if (outOfStock > 0) {
      score -= Math.min(outOfStock * 10, 30);
      issues.push(`${outOfStock} product${outOfStock > 1 ? 's' : ''} out of stock`);
    }
  }

  // --- Check 2: Lapsed customers (deduct 15 if lapsed > 10% of total) ---
  if (!customersResult.error && customersResult.data) {
    const customersData = customersResult.data as CustomerRow[];
    const total = customersData.length;
    const lapsed = customersData.filter(
      (c) => !c.last_visit || new Date(c.last_visit).getTime() < new Date(sixtyDaysAgo).getTime(),
    ).length;
    if (total > 0 && lapsed > total * 0.1) {
      score -= 15;
      const pct = Math.round((lapsed / total) * 100);
      issues.push(`${lapsed} customers haven't visited in 60+ days (${pct}% of base)`);
    }
  }

  // --- Check 3: Unanswered reviews (deduct 5 each, max -20) ---
  if (unansweredCount > 0) {
    score -= Math.min(unansweredCount * 5, 20);
    issues.push(`${unansweredCount} unanswered review${unansweredCount > 1 ? 's' : ''}`);
  }

  // --- Check 4: Staff with expiring visas (deduct 20 if any) ---
  if (expiringStaffCount > 0) {
    score -= 20;
    issues.push(
      `${expiringStaffCount} staff member${expiringStaffCount > 1 ? 's have' : ' has'} visa expiry within 30 days`,
    );
  }

  // --- Check 5: Revenue trend (deduct 15 if current week < 80% of prior week) ---
  if (!currentSalesResult.error && !previousSalesResult.error) {
    const currentData = (currentSalesResult.data ?? []) as SaleRow[];
    const previousData = (previousSalesResult.data ?? []) as SaleRow[];
    const currentTotal = currentData.reduce(
      (sum: number, s: SaleRow) => sum + (s.total_amount ?? 0),
      0,
    );
    const previousTotal = previousData.reduce(
      (sum: number, s: SaleRow) => sum + (s.total_amount ?? 0),
      0,
    );
    if (previousTotal > 0 && currentTotal < previousTotal * 0.8) {
      score -= 15;
      const dropPct = Math.round(((previousTotal - currentTotal) / previousTotal) * 100);
      issues.push(`Revenue down ${dropPct}% this week vs last week`);
    }
  }

  // Clamp score and derive grade
  score = Math.max(0, Math.min(100, score));
  const grade: Grade =
    score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';

  return NextResponse.json({
    score,
    grade,
    issues,
    generated_at: now.toISOString(),
  });
})
