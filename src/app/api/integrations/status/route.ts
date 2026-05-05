export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [
    { data: squareConn },
    { data: shopifyConn },
    { data: lightspeedConn },
  ] = await Promise.all([
    supabase.from('square_connections').select('sync_status, last_synced_at, connected_at')
      .eq('business_id', business_id).maybeSingle(),
    supabase.from('shopify_connections').select('sync_status, last_synced_at, shop_name, store_url')
      .eq('business_id', business_id).maybeSingle(),
    supabase.from('lightspeed_connections').select('sync_status, last_synced_at, account_id')
      .eq('business_id', business_id).maybeSingle(),
  ]);

  // Count imported products per source
  const [{ count: squareCount }, { count: shopifyCount }, { count: lsCount }] = await Promise.all([
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', business_id).eq('source', 'square'),
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', business_id).eq('source', 'shopify'),
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', business_id).eq('source', 'lightspeed'),
  ]);

  return NextResponse.json({
    square: squareConn
      ? { connected: true, ...squareConn, product_count: squareCount ?? 0 }
      : { connected: false },
    shopify: shopifyConn
      ? { connected: true, ...shopifyConn, product_count: shopifyCount ?? 0 }
      : { connected: false },
    lightspeed: lightspeedConn
      ? { connected: true, ...lightspeedConn, product_count: lsCount ?? 0 }
      : { connected: false },
  });
}
