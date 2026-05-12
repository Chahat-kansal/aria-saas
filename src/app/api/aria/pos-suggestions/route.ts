export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cart_item_ids: string[] = body.cart_item_ids ?? [];
  const business_id = body.business_id ?? await getBid(supabase, user.id);

  if (!business_id || cart_item_ids.length === 0) return NextResponse.json({ suggestions: [] });

  // Find sales that contain at least one of the cart items
  const { data: coSales } = await supabase
    .from('pos_sale_items')
    .select('sale_id')
    .in('product_id', cart_item_ids)
    .limit(200);

  if (!coSales?.length) return NextResponse.json({ suggestions: [] });

  const saleIds = [...new Set(coSales.map(s => s.sale_id))];

  // Find other products purchased in those same sales
  const { data: coItems } = await supabase
    .from('pos_sale_items')
    .select('product_id, quantity')
    .in('sale_id', saleIds)
    .not('product_id', 'in', `(${cart_item_ids.map(id => `'${id}'`).join(',')})`)
    .limit(500);

  // Count frequency
  const freq: Record<string, number> = {};
  for (const item of coItems ?? []) {
    freq[item.product_id] = (freq[item.product_id] ?? 0) + (item.quantity ?? 1);
  }

  const topIds = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  if (topIds.length === 0) return NextResponse.json({ suggestions: [] });

  // Get product details for top suggestions
  const { data: products } = await supabase
    .from('pos_products')
    .select('id, name, price, stock_quantity, track_stock, is_active')
    .in('id', topIds)
    .eq('business_id', business_id)
    .eq('is_active', true);

  const inStock = (products ?? []).filter(p => !p.track_stock || (p.stock_quantity ?? 0) > 0);

  const suggestions = inStock.slice(0, 3).map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    frequency: freq[p.id] ?? 0,
  }));

  return NextResponse.json({ suggestions });
}

export const POST = withErrorCapture('aria/pos-suggestions', _POST)
