export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBusinessItems, getBusinessSales } from '@/lib/business-data';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  const { data: biz } = await supabase.from('businesses').select('id, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const dataSource = (biz.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [items, sales, itemLocs, lots] = await Promise.all([
    getBusinessItems(business_id, dataSource),
    getBusinessSales(business_id, thirtyDaysAgo, dataSource),
    supabase.from('warehouse_item_locations').select('item_id, warehouse_locations(label, zone)').eq('business_id', business_id),
    supabase.from('warehouse_lots').select('item_id, quantity_remaining, expiry_date, status').eq('business_id', business_id).eq('status', 'active'),
  ]);

  // Velocity
  const unitsSold: Record<string, number> = {};
  for (const sale of sales) {
    for (const li of sale.lineItems) {
      unitsSold[li.itemId] = (unitsSold[li.itemId] ?? 0) + li.quantity;
    }
  }

  // Location map
  const locMap: Record<string, { label: string; zone: string }> = {};
  for (const il of itemLocs.data ?? []) {
    locMap[(il as any).item_id] = (il as any).warehouse_locations ?? { label: '—', zone: '—' };
  }

  // Lot map (active qty + expiry)
  const lotMap: Record<string, { qty: number; earliest_expiry: string | null }> = {};
  for (const l of lots.data ?? []) {
    if (!lotMap[l.item_id]) lotMap[l.item_id] = { qty: 0, earliest_expiry: null };
    lotMap[l.item_id].qty += l.quantity_remaining;
    if (l.expiry_date && (!lotMap[l.item_id].earliest_expiry || l.expiry_date < lotMap[l.item_id].earliest_expiry!)) {
      lotMap[l.item_id].earliest_expiry = l.expiry_date;
    }
  }

  const enriched = items.map(i => {
    const vel = unitsSold[i.id] ?? unitsSold[i.externalId] ?? 0;
    const velocityRank = vel > 50 ? 'high' : vel > 10 ? 'medium' : 'low';
    const daysStock = vel > 0 ? Math.floor(i.currentStock / (vel / 30)) : null;
    const loc = locMap[i.id];
    const lot = lotMap[i.id];
    return {
      id: i.id,
      name: i.name,
      sku: i.sku ?? null,
      stock: i.currentStock,
      cost: i.costCents / 100,
      value_cents: i.currentStock * i.costCents,
      velocity_30d: vel,
      velocity_rank: velocityRank,
      days_stock: daysStock,
      reorder_point: i.reorderPoint,
      needs_reorder: i.currentStock <= i.reorderPoint,
      location: loc?.label ?? null,
      zone: loc?.zone ?? null,
      lot_qty: lot?.qty ?? null,
      earliest_expiry: lot?.earliest_expiry ?? null,
    };
  });

  return NextResponse.json({ items: enriched });
}
