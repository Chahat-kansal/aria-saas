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

  const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const [products, pendingPOs, expiringLots] = await Promise.all([
    supabase.from('pos_products').select('stock_quantity, cost_price, low_stock_threshold').eq('business_id', business_id).eq('is_active', true),
    supabase.from('pos_purchase_orders').select('id', { count: 'exact', head: true }).eq('business_id', business_id).in('status', ['draft', 'sent']),
    supabase.from('warehouse_lots').select('quantity_remaining, unit_cost_cents').eq('business_id', business_id).eq('status', 'active').lte('expiry_date', thirtyDaysOut).gte('expiry_date', today).gt('quantity_remaining', 0),
  ]);

  const prods = products.data ?? [];
  const stockValueCents = prods.reduce((s, p) => s + (p.stock_quantity ?? 0) * ((p.cost_price ?? 0) * 100), 0);
  const lowStockCount = prods.filter(p => (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 0) && (p.stock_quantity ?? 0) > 0).length;
  const outOfStockCount = prods.filter(p => (p.stock_quantity ?? 0) <= 0).length;

  const expLots = expiringLots.data ?? [];
  const expiringLotsValueCents = expLots.reduce((s, l) => s + (l.quantity_remaining ?? 0) * (l.unit_cost_cents ?? 0), 0);

  return NextResponse.json({
    stock_value_cents: Math.round(stockValueCents),
    low_stock_count: lowStockCount,
    out_of_stock_count: outOfStockCount,
    pending_po_count: pendingPOs.count ?? 0,
    expiring_lots_count: expLots.length,
    expiring_lots_value_cents: expiringLotsValueCents,
  });
}

export const GET = withErrorCapture('warehouse/kpis', _GET)
