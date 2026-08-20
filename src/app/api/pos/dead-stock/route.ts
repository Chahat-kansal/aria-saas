export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { generateInsight } from '@/lib/aria-insights';
import { thirtyDaysAgoAEST } from '@/lib/date-au';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveCostBatch } from '@/lib/inventory/resolve-cost'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

const ACTIONS = ['Clearance 50% off', 'Return to supplier', 'Bundle promo', 'Dispose', 'Investigate'];

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ items: [] });

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') ?? '60');
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // INTEL-COMPUTE-2 — was stock_quantity * cost_price, the stale/unmaintained column pair behind the
  // recurring "parallel warehouse stack" incident. Now sums real pos_outlet_inventory.items_on_hand
  // across outlets and resolves cost via the canonical resolveCostBatch(), matching business-data.ts/
  // warehouse/kpis/route.ts/pos/reports/inventory/route.ts. The stale-column pre-filter is gone
  // (can't push a real-stock filter into this query since it now comes from a separate table), so
  // products are fetched unfiltered and the on-hand>0 check happens in JS below.
  const [{ data: allProducts }, { data: outletInv }, costMap] = await Promise.all([
    supabase.from('pos_products').select('id,name,sku,price').eq('business_id', bid).eq('is_active', true).limit(2000),
    supabase.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', bid),
    resolveCostBatch(supabase, bid, null),
  ]);
  const stockByProduct = new Map<string, number>();
  for (const row of outletInv ?? []) {
    const pid = row.product_id as string;
    stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + (Number(row.items_on_hand) || 0));
  }
  const products = (allProducts ?? [])
    .map(p => ({ ...p, stock_quantity: stockByProduct.get(p.id) ?? 0, cost_price: costMap.get(p.id)?.cost ?? 0 }))
    .filter(p => p.stock_quantity > 0);

  if (!products?.length) return NextResponse.json({ items: [] });

  // Get last sale date per product in the cutoff window.
  // pos_sale_items has no business_id column — product_ids are already
  // scoped to the business via the products query above.
  const { data: recentSales } = await supabase.from('pos_sale_items')
    .select('product_id,created_at')
    .gte('created_at', cutoff)
    .in('product_id', products.map(p => p.id))
    .limit(5000);

  const soldRecently = new Set((recentSales ?? []).map(s => s.product_id));

  // Find last sale ever for dead items
  const deadProductIds = products.filter(p => !soldRecently.has(p.id)).map(p => p.id);

  const lastSaleMap = new Map<string, string>();
  if (deadProductIds.length > 0) {
    const { data: lastSales } = await supabase.from('pos_sale_items')
      .select('product_id,created_at')
      .in('product_id', deadProductIds)
      .order('created_at', { ascending: false })
      .limit(deadProductIds.length * 2);
    for (const s of (lastSales ?? [])) {
      if (!lastSaleMap.has(s.product_id)) lastSaleMap.set(s.product_id, s.created_at);
    }
  }

  const now = Date.now();
  const items = products
    .filter(p => !soldRecently.has(p.id))
    .map((p, i) => {
      const lastSold = lastSaleMap.get(p.id) ?? null;
      const daysSince = lastSold ? Math.floor((now - new Date(lastSold).getTime()) / 86400000) : days + 1;
      const value_cost = (p.stock_quantity ?? 0) * (p.cost_price ?? 0);
      const suggestedAction = value_cost > 500 ? 'Return to supplier' :
        daysSince > 180 ? 'Dispose' :
        daysSince > 90 ? 'Clearance 50% off' :
        !lastSold ? 'Investigate' : 'Bundle promo';
      return {
        id: p.id, name: p.name, sku: p.sku ?? '—', outlet_name: 'All',
        stock_quantity: p.stock_quantity ?? 0, value_cost,
        cost_unknown: (p.cost_price ?? 0) <= 0, // resolver left null → this item is NOT in any $ total
        value_retail: (p.stock_quantity ?? 0) * (p.price ?? 0),
        last_sold: lastSold, days_since: daysSince, suggested_action: suggestedAction,
      };
    }).sort((a, b) => b.value_cost - a.value_cost);

  const totalValue = items.reduce((s, i) => s + i.value_cost, 0); // priced items only
  const uncostedItemCount = items.filter(i => i.cost_unknown).length;

  let insight = null;
  if (bid) {
    const res = await generateInsight({ business_id: bid, context: `dead_stock_report days=${days} total_items=${items.length} total_value=$${totalValue.toFixed(0)} uncosted_items=${uncostedItemCount} (value covers costed items only)`, data: { items: items.length, totalValue, top5: items.slice(0, 5).map(i => i.name) }, maxBullets: 2 });
    insight = { bullets: res.bullets };
  }

  return NextResponse.json({ items, insight, uncosted_item_count: uncostedItemCount });
}

export const GET = withErrorCapture('pos/dead-stock', _GET)
