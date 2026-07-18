export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { resolveCostBatch } from '@/lib/inventory/resolve-cost'

async function _GET(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  try {
    let query = supabase
      .from('pos_products')
      .select('id, name, sku, barcode, price, cost_price, stock_quantity, low_stock_threshold, track_stock, is_active, pos_categories(name, color)')
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('name');

    if (category) query = query.eq('category_id', category);

    const { data: products, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // INTEL-COMPUTE-2 — was stock_quantity * cost_price, the stale/unmaintained column pair behind
    // the recurring "parallel warehouse stack" incident. Now sums real pos_outlet_inventory.items_on_hand
    // across outlets and resolves cost via the canonical resolveCostBatch() (outlet actual → last
    // receipt → PO history → catalogue, never fabricated) — the same pattern business-data.ts's
    // getBusinessItems() and warehouse/kpis/route.ts already use. status (out/low/ok) now uses the
    // same real on-hand quantity, not the stale column.
    const [{ data: outletInv }, costMap] = await Promise.all([
      supabase.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', bid),
      resolveCostBatch(supabase, bid, null),
    ]);
    const stockByProduct = new Map<string, number>();
    for (const row of outletInv ?? []) {
      const pid = row.product_id as string;
      stockByProduct.set(pid, (stockByProduct.get(pid) ?? 0) + (Number(row.items_on_hand) || 0));
    }

    const rows = (products ?? []).map(p => {
      const onHand = stockByProduct.get(p.id) ?? 0;
      const resolved = costMap.get(p.id);
      const cost = resolved?.cost ?? 0;
      return {
        ...p,
        stock_value: onHand * cost,
        status: !p.track_stock ? 'untracked'
          : onHand <= 0 ? 'out'
          : onHand <= (p.low_stock_threshold ?? 5) ? 'low'
          : 'ok',
      };
    });

    const total_stock_value = rows.reduce((s, p) => s + p.stock_value, 0);
    const low_count  = rows.filter(p => p.status === 'low').length;
    const out_count  = rows.filter(p => p.status === 'out').length;
    const total_products = rows.length;

    return NextResponse.json({ products: rows, total_stock_value, low_count, out_count, total_products });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = withBusinessContext('pos/reports/inventory', _GET)
