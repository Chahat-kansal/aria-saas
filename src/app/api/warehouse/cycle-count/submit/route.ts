export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, counts } = await req.json();
  // counts: [{ id: cycle_count_row_id, item_id, counted_qty }]
  if (!business_id || !Array.isArray(counts)) return NextResponse.json({ error: 'business_id and counts required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const results = [];
  for (const c of counts) {
    if (c.counted_qty === null || c.counted_qty === undefined) continue;

    // Get expected
    const { data: row } = await supabase.from('warehouse_cycle_counts').select('expected_qty, item_id').eq('id', c.id).single();
    if (!row) continue;
    const variance = c.counted_qty - (row.expected_qty ?? 0);

    // Update cycle count record
    await supabase.from('warehouse_cycle_counts')
      .update({ counted_qty: c.counted_qty, variance, status: 'completed', counted_at: new Date().toISOString() })
      .eq('id', c.id);

    // Update actual stock
    await supabase.from('pos_products')
      .update({ stock_quantity: c.counted_qty })
      .eq('id', row.item_id)
      .eq('business_id', business_id);

    // Log movement if variance
    if (variance !== 0) {
      await supabase.from('stock_movements').insert({
        business_id,
        item_id: row.item_id,
        movement_type: 'cycle_count',
        quantity_added: variance,
        new_stock: c.counted_qty,
        notes: `Cycle count adjustment: ${variance > 0 ? '+' : ''}${variance}`,
      }).then(() => null, () => null);
    }

    results.push({ id: c.id, item_id: row.item_id, variance });
  }

  return NextResponse.json({ ok: true, results });
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = searchParams.get('status') ?? 'pending';
  const { data } = await supabase.from('warehouse_cycle_counts')
    .select('*')
    .eq('business_id', business_id)
    .eq('status', status)
    .order('counted_at', { ascending: false })
    .limit(100);

  return NextResponse.json({ items: data ?? [] });
}

export const GET = withErrorCapture('warehouse/cycle-count/submit', _GET)
export const POST = withErrorCapture('warehouse/cycle-count/submit', _POST)
