export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

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

/** Wraps a Supabase count query so Promise rejection maps to 0. */
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

export async function GET(req: Request) {
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
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

  // Run all fetches in parallel — each wrapped in async IIFE so .catch works
  const [reviews, winback, lowStockRaw, staff_alerts, profit_leaks, missed_demand, intelligence] = await Promise.all([
    (async () => { try { const r = await supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('business_id', businessId).is('response', null).gte('created_at', thirtyDaysAgo); return r.count ?? 0; } catch { return 0; } })(),
    (async () => { try { const r = await supabase.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).lt('last_visit', sixtyDaysAgo); return r.count ?? 0; } catch { return 0; } })(),
    (async () => { try { const r = await supabase.from('pos_products').select('stock_quantity, low_stock_threshold').eq('business_id', businessId).eq('track_stock', true).eq('is_active', true); return { data: r.data as Array<{ stock_quantity: number | null; low_stock_threshold: number | null }> | null, error: r.error }; } catch { return { data: null, error: new Error('failed') }; } })(),
    (async () => { try { const r = await supabase.from('staff_members').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'active').lte('visa_expiry_date', sixtyDaysFromNow); return r.count ?? 0; } catch { return 0; } })(),
    (async () => { try { const r = await supabase.from('profit_leaks').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'detected'); return r.count ?? 0; } catch { return 0; } })(),
    (async () => { try { const r = await supabase.from('missed_demand').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'pending'); return r.count ?? 0; } catch { return 0; } })(),
    (async () => { try { const r = await supabase.from('intelligence_events').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('acknowledged', false); return r.count ?? 0; } catch { return 0; } })(),
  ]);

  // Compute low_stock from the raw product rows
  let low_stock = 0;
  if (!lowStockRaw.error && lowStockRaw.data) {
    low_stock = lowStockRaw.data.filter(
      (p: { stock_quantity: number | null; low_stock_threshold: number | null }) =>
        (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 0),
    ).length;
  }

  return NextResponse.json({
    reviews,
    winback,
    low_stock,
    staff_alerts,
    profit_leaks,
    missed_demand,
    intelligence,
  });
}
