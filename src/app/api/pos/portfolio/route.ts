export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

/**
 * Cross-business "portfolio brain".
 * Returns today's snapshot for EVERY business the user owns — revenue,
 * sale count, low-stock count — so the POS business switcher can show
 * which venue needs attention without the operator switching into it.
 * No competitor (Square / Toast / Oolio) exposes this; each treats
 * locations as silos.
 */
async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id,name,industry')
    .eq('user_id', user.id)
    .or('is_active.eq.true,is_active.is.null')
    .order('created_at', { ascending: true });

  if (!businesses?.length) return NextResponse.json({ portfolio: [] });

  // Start of today in the server's clock — good enough for a snapshot strip
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

  const ids = businesses.map(b => b.id);

  // One query each, scoped to the user's business IDs only
  const [{ data: sales }, { data: products }] = await Promise.all([
    supabase
      .from('pos_sales')
      .select('business_id,total_amount,status,created_at')
      .in('business_id', ids)
      .neq('status', 'voided')
      .gte('created_at', startIso),
    supabase
      .from('pos_products')
      .select('business_id,stock_quantity,low_stock_threshold,track_stock,is_active')
      .in('business_id', ids),
  ]);

  const portfolio = businesses.map(b => {
    const bizSales = (sales ?? []).filter(s => s.business_id === b.id);
    const revenue = bizSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const saleCount = bizSales.length;
    const lowStock = (products ?? []).filter(p =>
      p.business_id === b.id &&
      p.is_active &&
      p.track_stock &&
      (Number(p.stock_quantity) || 0) <= (Number(p.low_stock_threshold) || 5)
    ).length;

    // Simple attention flag — surfaces the venue that needs the operator
    let attention: 'low_stock' | 'no_sales' | null = null;
    if (lowStock > 0) attention = 'low_stock';
    else if (saleCount === 0) attention = 'no_sales';

    return {
      business_id: b.id,
      name: b.name,
      industry: b.industry,
      revenue_today: Number(revenue.toFixed(2)),
      sales_today: saleCount,
      low_stock_count: lowStock,
      attention,
    };
  });

  return NextResponse.json({ portfolio });
}

export const GET = withErrorCapture('pos/portfolio', _GET)
