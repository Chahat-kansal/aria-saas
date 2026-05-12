export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const status = searchParams.get('status') ?? 'quarantined';
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let q = supabase.from('warehouse_quarantine').select('*').eq('business_id', business_id).order('quarantined_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q.limit(100);
  return NextResponse.json({ items: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, item_id, item_name, lot_id, quantity, reason, quarantined_by, notes } = body;
  if (!business_id || !item_id || !item_name || !quantity || !reason) {
    return NextResponse.json({ error: 'business_id, item_id, item_name, quantity, reason required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase.from('warehouse_quarantine').insert({
    business_id, item_id, item_name, lot_id: lot_id ?? null,
    quantity, reason, quarantined_by: quarantined_by ?? null, notes: notes ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduct from stock
  if (item_id) {
    const { data: prod } = await supabase.from('pos_products').select('stock_quantity').eq('id', item_id).eq('business_id', business_id).maybeSingle();
    if (prod) {
      await supabase.from('pos_products').update({
        stock_quantity: Math.max(0, (prod.stock_quantity ?? 0) - quantity),
      }).eq('id', item_id).eq('business_id', business_id);
    }
  }

  return NextResponse.json({ item: data }, { status: 201 });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id, business_id, status, resolution, notes, quantity_released } = body;
  if (!id || !business_id || !status) return NextResponse.json({ error: 'id, business_id, status required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = { status, resolution: resolution ?? null, notes: notes ?? null };
  if (status === 'released' || status === 'disposed' || status === 'returned_to_supplier') {
    updates.released_at = new Date().toISOString();
  }

  const { data: item, error } = await supabase.from('warehouse_quarantine').update(updates).eq('id', id).eq('business_id', business_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If releasing back to stock, add quantity back
  if (status === 'released' && item && quantity_released) {
    const { data: prod } = await supabase.from('pos_products').select('stock_quantity').eq('id', item.item_id).eq('business_id', business_id).maybeSingle();
    if (prod) {
      await supabase.from('pos_products').update({
        stock_quantity: (prod.stock_quantity ?? 0) + quantity_released,
      }).eq('id', item.item_id).eq('business_id', business_id);
    }
  }

  return NextResponse.json({ item });
}

export const GET = withErrorCapture('warehouse/quarantine', _GET)
export const POST = withErrorCapture('warehouse/quarantine', _POST)
export const PATCH = withErrorCapture('warehouse/quarantine', _PATCH)
