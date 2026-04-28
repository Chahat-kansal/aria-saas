export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBusinessItems, getBusinessSales } from '@/lib/business-data';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const dataSource = (biz.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [items, sales] = await Promise.all([
    getBusinessItems(business_id, dataSource),
    getBusinessSales(business_id, thirtyDaysAgo, dataSource),
  ]);

  const unitsSold: Record<string, number> = {};
  for (const sale of sales) {
    for (const li of sale.lineItems) {
      unitsSold[li.itemId] = (unitsSold[li.itemId] ?? 0) + li.quantity;
    }
  }

  // Last count dates
  const { data: lastCounts } = await supabase
    .from('warehouse_cycle_counts')
    .select('item_id, counted_at')
    .eq('business_id', business_id)
    .order('counted_at', { ascending: false });

  const lastCountMap: Record<string, string> = {};
  for (const c of lastCounts ?? []) {
    if (!lastCountMap[c.item_id]) lastCountMap[c.item_id] = c.counted_at;
  }

  // Score items: high velocity + not counted recently = higher priority
  const today = Date.now();
  const scored = items.map(i => {
    const vel = unitsSold[i.id] ?? unitsSold[i.externalId] ?? 0;
    const lastCounted = lastCountMap[i.id] ? new Date(lastCountMap[i.id]).getTime() : 0;
    const daysSinceCounted = lastCounted ? (today - lastCounted) / 86400000 : 999;
    return { ...i, velocity: vel, daysSinceCounted, score: vel * 0.6 + daysSinceCounted * 0.4 };
  });

  const selected = scored.sort((a, b) => b.score - a.score).slice(0, 20);

  // Create a cycle count session
  const sessionDate = new Date().toISOString().split('T')[0];
  const rows = selected.map(i => ({
    business_id,
    item_id: i.id,
    item_name: i.name,
    expected_qty: i.currentStock,
    counted_qty: null,
    variance: null,
    counted_at: sessionDate,
    status: 'pending',
  }));

  const { data: inserted, error: e } = await supabase.from('warehouse_cycle_counts').insert(rows).select();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });

  return NextResponse.json({ items: inserted ?? [], session_date: sessionDate });
}
