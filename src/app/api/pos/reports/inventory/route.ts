export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  try {
    let query = supabase
      .from('pos_products')
      .select('id, name, sku, barcode, price, cost_price, stock_quantity, low_stock_threshold, track_stock, is_active, pos_categories(name, color)')
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('name');

    if (category) query = query.eq('category_id', category);

    const { data: products, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (products ?? []).map(p => ({
      ...p,
      stock_value: ((p.stock_quantity ?? 0) * (p.cost_price ?? 0)),
      status: !p.track_stock ? 'untracked'
        : (p.stock_quantity ?? 0) <= 0 ? 'out'
        : (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5) ? 'low'
        : 'ok',
    }));

    const total_stock_value = rows.reduce((s, p) => s + p.stock_value, 0);
    const low_count  = rows.filter(p => p.status === 'low').length;
    const out_count  = rows.filter(p => p.status === 'out').length;
    const total_products = rows.length;

    return NextResponse.json({ products: rows, total_stock_value, low_count, out_count, total_products });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = withErrorCapture('pos/reports/inventory', _GET)
