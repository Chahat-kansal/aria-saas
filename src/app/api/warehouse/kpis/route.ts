export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveCostBatch } from '@/lib/inventory/resolve-cost'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const [products, pendingPOs, expiringLots, outletInv, costMap] = await Promise.all([
    supabase.from('pos_products').select('id, low_stock_threshold').eq('business_id', business_id).eq('is_active', true),
    supabase.from('pos_purchase_orders').select('id', { count: 'exact', head: true }).eq('business_id', business_id).in('status', ['draft', 'sent']),
    supabase.from('warehouse_lots').select('quantity_remaining, unit_cost_cents').eq('business_id', business_id).eq('status', 'active').lte('expiry_date', thirtyDaysOut).gte('expiry_date', today).gt('quantity_remaining', 0),
    supabase.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', business_id),
    resolveCostBatch(supabase, business_id, null),
  ]);

  // INTEL-COMPUTE-2 — was pos_products.stock_quantity * cost_price, the stale/unmaintained column
  // pair behind the recurring "parallel warehouse stack" incident (a prior fix documented this
  // exact business's stock value "summed to a fabricated A$234,523... vs the real A$11,476" — still
  // reproducible live today, ~20x overstated). Now sums real pos_outlet_inventory.items_on_hand
  // across outlets and resolves cost via the canonical resolveCostBatch() (outlet actual → last
  // receipt → PO history → catalogue, never fabricated) — the same pattern business-data.ts's
  // getBusinessItems() already uses.
  const prods = products.data ?? [];
  const stockByProduct = new Map<string, number>();
  for (const row of outletInv.data ?? []) {
    const pid = row.product_id as string;
    stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + (Number(row.items_on_hand) || 0));
  }
  const stockValueCents = prods.reduce((s, p) => {
    const onHand = stockByProduct.get(p.id) ?? 0;
    const resolved = costMap.get(p.id);
    const costCents = resolved?.cost != null ? Math.round(resolved.cost * 100) : 0;
    return s + onHand * costCents;
  }, 0);
  const lowStockCount = prods.filter(p => {
    const onHand = stockByProduct.get(p.id) ?? 0;
    return onHand <= (p.low_stock_threshold ?? 0) && onHand > 0;
  }).length;
  const outOfStockCount = prods.filter(p => (stockByProduct.get(p.id) ?? 0) <= 0).length;

  const expLots = expiringLots.data ?? [];
  const expiringLotsValueCents = expLots.reduce((s, l) => s + (l.quantity_remaining ?? 0) * (l.unit_cost_cents ?? 0), 0);

  return NextResponse.json({
    stock_value_cents: Math.round(stockValueCents),
    low_stock_count: lowStockCount,
    out_of_stock_count: outOfStockCount,
    pending_po_count: pendingPOs.count ?? 0,
    expiring_lots_count: expLots.length,
    expiring_lots_value_cents: expiringLotsValueCents,
  });
}

export const GET = withErrorCapture('warehouse/kpis', _GET)
