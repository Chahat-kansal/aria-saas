export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  // Verify business ownership
  let bid = business_id;
  if (!bid) {
    const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
    bid = active?.business_id ?? null;
    if (!bid) {
      const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
      bid = biz?.id ?? null;
    }
  } else {
    const { data: biz } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', user.id).maybeSingle();
    if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!bid) return NextResponse.json({ product: null, barcode }, { status: 200 });

  const { data: product } = await supabase
    .from('pos_products')
    .select('id,name,price,cost_price,stock_quantity,low_stock_threshold,track_stock,barcode,sku,image_url,category_id,tax_rate,is_active,pos_categories(name,color)')
    .eq('business_id', bid)
    .eq('is_active', true)
    .or(`barcode.eq.${barcode},sku.eq.${barcode}`)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ product: product ?? null, barcode });
}
