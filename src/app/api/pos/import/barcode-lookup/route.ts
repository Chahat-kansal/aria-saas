export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const barcode     = searchParams.get('barcode')?.trim();
  const business_id = searchParams.get('business_id');

  if (!barcode) return NextResponse.json({ error: 'barcode required' }, { status: 400 });

  // Resolve business_id
  let bid = business_id;
  if (!bid) {
    const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
    bid = active?.business_id ?? null;
    if (!bid) {
      const { data: b } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
      bid = b?.id ?? null;
    }
  } else {
    const { data: b } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', user.id).maybeSingle();
    if (!b) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1. Check own catalogue first
  const { data: existing } = await supabase
    .from('pos_products')
    .select('id, name, price, cost_price, stock_quantity, track_stock, barcode, sku, image_url, category_id, is_active, pos_categories(name,color)')
    .eq('business_id', bid!)
    .or(`barcode.eq.${barcode},sku.eq.${barcode}`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ source: 'catalogue', product: existing, barcode });
  }

  // 2. Try Open Food Facts (best for grocery/packaged goods)
  try {
    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { headers: { 'User-Agent': 'AriaPOS/1.0 (contact@aria.com)' }, signal: AbortSignal.timeout(4000) }
    );
    if (offRes.ok) {
      const offData = await offRes.json();
      if (offData.status === 1 && offData.product) {
        const p = offData.product;
        const name = p.product_name_en || p.product_name || p.abbreviated_product_name || null;
        if (name) {
          return NextResponse.json({
            source: 'openfoodfacts',
            barcode,
            product: {
              name,
              barcode,
              description: p.generic_name_en || p.generic_name || null,
              image_url: p.image_url || p.image_front_url || null,
              category: p.categories_tags?.[0]?.replace('en:', '') ?? null,
              brand: p.brands || null,
              quantity: p.quantity || null,
            },
          });
        }
      }
    }
  } catch { /* timeout or network error — fall through */ }

  // 3. Not found anywhere
  return NextResponse.json({ source: 'not_found', barcode, product: null });
}
