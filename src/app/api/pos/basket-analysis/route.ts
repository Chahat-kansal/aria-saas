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

interface ItemRow { sale_id: string | null; product_id: string | null; product_name: string | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ pairs: [] });

  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data } = await supabase.from('pos_sale_items')
    .select('sale_id, product_id, product_name, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', bid)
    .neq('pos_sales.status', 'voided')
    .gte('pos_sales.created_at', since)
    .limit(20000);

  const rows = (data ?? []) as unknown as ItemRow[];
  // Group items per sale
  const bySale: Record<string, string[]> = {};
  const nameById: Record<string, string> = {};
  for (const r of rows) {
    if (!r.sale_id || !r.product_id) continue;
    if (!bySale[r.sale_id]) bySale[r.sale_id] = [];
    bySale[r.sale_id].push(r.product_id);
    nameById[r.product_id] = r.product_name ?? r.product_id;
  }

  const totalSales = Object.keys(bySale).length;
  const pairCount: Record<string, number> = {};
  for (const items of Object.values(bySale)) {
    const uniq = Array.from(new Set(items));
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const key = [uniq[i], uniq[j]].sort().join('|');
        pairCount[key] = (pairCount[key] ?? 0) + 1;
      }
    }
  }

  const pairs = Object.entries(pairCount)
    .map(([key, count]) => {
      const [a, b] = key.split('|');
      return { product_a: nameById[a] ?? a, product_b: nameById[b] ?? b, co_occurrences: count, pct_of_sales: totalSales > 0 ? Math.round((count / totalSales) * 1000) / 10 : 0 };
    })
    .filter(p => p.co_occurrences >= 3)
    .sort((a, b) => b.co_occurrences - a.co_occurrences)
    .slice(0, 5);

  return NextResponse.json({ pairs, total_sales_analysed: totalSales });
}

export const GET = withErrorCapture('pos/basket-analysis', _GET);
