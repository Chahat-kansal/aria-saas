export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const product_id = searchParams.get('product_id');
  const outlet_id  = searchParams.get('outlet_id');

  // SECURITY-CRITICAL-3 — this previously had no business scoping at all: omitting both query
  // params returned every tenant's cost/margin/pricing data in one call. pos_price_points has no
  // business_id column of its own (same as PATCH/DELETE below), so scope via the product
  // relationship — only ever return rows for products the caller's own business owns.
  if (product_id) {
    const { data: prod } = await supabase.from('pos_products').select('id').eq('id', product_id).eq('business_id', bid).maybeSingle();
    if (!prod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data: ownProducts } = await supabase.from('pos_products').select('id').eq('business_id', bid);
  const ownProductIds = (ownProducts ?? []).map(p => p.id);
  if (ownProductIds.length === 0) return NextResponse.json({ price_points: [] });

  let query = supabase.from('pos_price_points').select('*').in('product_id', ownProductIds).order('quantity');
  if (product_id) query = query.eq('product_id', product_id);
  if (outlet_id)  query = query.eq('outlet_id', outlet_id);

  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ price_points: [] }); // table not yet created
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ price_points: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { product_id, outlet_id, price_set_name, quantity, price, cost } = body;
  if (!product_id || !quantity || !price) return NextResponse.json({ error: 'product_id, quantity, price required' }, { status: 400 });

  const margin_percent = cost && price > 0 ? ((price - cost) / price) * 100 : null;

  const { data, error } = await supabase.from('pos_price_points').insert({
    product_id, outlet_id: outlet_id ?? null,
    price_set_name: price_set_name ?? 'Default Price Set',
    quantity: parseInt(quantity), price: parseFloat(price),
    cost: cost ? parseFloat(cost) : null, margin_percent,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ price_point: data });
}

async function _PATCH(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // pos_price_points has no business_id column — verify ownership via product relationship.
  const { data: pp } = await supabase.from('pos_price_points').select('product_id').eq('id', id).maybeSingle();
  if (!pp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: prod } = await supabase.from('pos_products').select('id').eq('id', pp.product_id).eq('business_id', bid).maybeSingle();
  if (!prod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  if (body.price && body.cost) {
    body.margin_percent = ((body.price - body.cost) / body.price) * 100;
  }

  const { error } = await supabase.from('pos_price_points').update(body).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // pos_price_points has no business_id column — verify ownership via product relationship.
  const { data: pp } = await supabase.from('pos_price_points').select('product_id').eq('id', id).maybeSingle();
  if (!pp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: prod } = await supabase.from('pos_products').select('id').eq('id', pp.product_id).eq('business_id', bid).maybeSingle();
  if (!prod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase.from('pos_price_points').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withBusinessContext('pos/price-points', _GET)
export const POST = withErrorCapture('pos/price-points', _POST)
export const PATCH = withBusinessContext('pos/price-points', _PATCH)
export const DELETE = withBusinessContext('pos/price-points', _DELETE)
