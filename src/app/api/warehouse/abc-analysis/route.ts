export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

interface ABCItem {
  id: string;
  name: string;
  category: string | null;
  revenue_cents: number;
  units_sold: number;
  revenue_pct: number;
  cumulative_pct: number;
  abc_class: 'A' | 'B' | 'C';
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, days = 90 } = await req.json().catch(() => ({}));
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Get all sale items in the window
  const salesRes = await supabase
    .from('pos_sales')
    .select('id')
    .eq('business_id', business_id)
    .gte('created_at', since)
    .eq('status', 'completed');

  const saleIds = (salesRes.data ?? []).map((s: any) => s.id);
  if (saleIds.length === 0) {
    return NextResponse.json({ items: [], total_revenue_cents: 0, analysis_period_days: days, no_data: true });
  }

  const itemsRes = await supabase
    .from('pos_sale_items')
    .select('product_id, product_name, quantity, unit_price')
    .in('sale_id', saleIds.slice(0, 1000));

  const saleItems = itemsRes.data ?? [];

  // Aggregate by product
  const byProduct: Record<string, { name: string; revenue: number; units: number; category: string | null }> = {};
  for (const item of saleItems) {
    const id = (item as any).product_id ?? 'unknown';
    const name = (item as any).product_name ?? 'Unknown';
    const rev = Math.round(((item as any).unit_price ?? 0) * ((item as any).quantity ?? 1) * 100);
    const units = (item as any).quantity ?? 1;
    if (!byProduct[id]) byProduct[id] = { name, revenue: 0, units: 0, category: null };
    byProduct[id].revenue += rev;
    byProduct[id].units += units;
  }

  // Get categories for known products
  const productIds = Object.keys(byProduct).filter(id => id !== 'unknown');
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('pos_products')
      .select('id, pos_categories(name)')
      .in('id', productIds.slice(0, 200));
    for (const p of (products ?? [])) {
      const pid = (p as any).id;
      if (byProduct[pid]) {
        byProduct[pid].category = (p as any).pos_categories?.name ?? null;
      }
    }
  }

  const totalRevenue = Object.values(byProduct).reduce((s, p) => s + p.revenue, 0);
  if (totalRevenue === 0) {
    return NextResponse.json({ items: [], total_revenue_cents: 0, analysis_period_days: days, no_data: true });
  }

  // Sort by revenue descending and assign ABC class
  const sorted = Object.entries(byProduct)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.revenue - a.revenue);

  let cumulative = 0;
  const items: ABCItem[] = sorted.map(p => {
    const revPct = (p.revenue / totalRevenue) * 100;
    cumulative += revPct;
    const abcClass: 'A' | 'B' | 'C' = cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C';
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      revenue_cents: p.revenue,
      units_sold: p.units,
      revenue_pct: Math.round(revPct * 10) / 10,
      cumulative_pct: Math.round(cumulative * 10) / 10,
      abc_class: abcClass,
    };
  });

  const summary = {
    a_count: items.filter(i => i.abc_class === 'A').length,
    b_count: items.filter(i => i.abc_class === 'B').length,
    c_count: items.filter(i => i.abc_class === 'C').length,
    a_revenue_pct: Math.round(items.filter(i => i.abc_class === 'A').reduce((s, i) => s + i.revenue_pct, 0)),
    b_revenue_pct: Math.round(items.filter(i => i.abc_class === 'B').reduce((s, i) => s + i.revenue_pct, 0)),
    c_revenue_pct: Math.round(items.filter(i => i.abc_class === 'C').reduce((s, i) => s + i.revenue_pct, 0)),
  };

  return NextResponse.json({
    items,
    summary,
    total_revenue_cents: totalRevenue,
    analysis_period_days: days,
    generated_at: new Date().toISOString(),
  });
}
