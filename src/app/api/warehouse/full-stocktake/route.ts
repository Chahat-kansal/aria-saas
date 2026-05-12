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
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: products } = await supabase.from('pos_products')
    .select('id, name, sku, stock_quantity, track_stock, is_active, stocktake_frozen, pos_categories(name)')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('name');

  const frozen = (products ?? []).filter((p: any) => p.stocktake_frozen).length;
  return NextResponse.json({ products: products ?? [], frozen_count: frozen });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, action, product_ids, counts } = body;
  if (!business_id || !action) return NextResponse.json({ error: 'business_id and action required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'freeze') {
    if (!product_ids?.length) return NextResponse.json({ error: 'product_ids required' }, { status: 400 });
    await supabase.from('pos_products').update({ stocktake_frozen: true }).in('id', product_ids).eq('business_id', business_id);
    return NextResponse.json({ ok: true, frozen: product_ids.length });
  }

  if (action === 'unfreeze') {
    await supabase.from('pos_products').update({ stocktake_frozen: false }).eq('business_id', business_id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'confirm') {
    // counts = [{ product_id, counted_qty, system_qty }]
    const countsArr: Array<{ product_id: string; counted_qty: number; system_qty: number }> = counts ?? [];
    const variances: Array<{ product_id: string; variance: number }> = [];

    for (const c of countsArr) {
      const variance = c.counted_qty - c.system_qty;
      if (variance !== 0) {
        variances.push({ product_id: c.product_id, variance });
        await supabase.from('pos_products').update({ stock_quantity: c.counted_qty, stocktake_frozen: false }).eq('id', c.product_id).eq('business_id', business_id);
      } else {
        await supabase.from('pos_products').update({ stocktake_frozen: false }).eq('id', c.product_id).eq('business_id', business_id);
      }
    }

    return NextResponse.json({ ok: true, variances, adjusted: variances.length });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export const GET = withErrorCapture('warehouse/full-stocktake', _GET)
export const POST = withErrorCapture('warehouse/full-stocktake', _POST)
