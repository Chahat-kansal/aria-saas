export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    business_id: string; barcode: string; name: string;
    price?: number; cost_price?: number; stock_quantity?: number;
    qty_backroom?: number; shelf_capacity?: number;
  };

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', body.business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: product, error } = await supabase.from('pos_products').insert({
    business_id:    body.business_id,
    barcode:        body.barcode,
    name:           body.name,
    price:          body.price ?? 0,
    cost_price:     body.cost_price ?? null,
    stock_quantity: body.stock_quantity ?? 0,
    qty_backroom:   body.qty_backroom ?? 0,
    shelf_capacity: body.shelf_capacity ?? null,
    track_stock:    true,
    is_active:      true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product });
}

export const POST = withErrorCapture('pos/products/quick-create', _POST);
