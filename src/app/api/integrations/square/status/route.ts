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

  const { data: conn } = await supabase.from('square_connections')
    .select('last_synced_at, sync_status, connected_at')
    .eq('business_id', business_id)
    .single();

  if (!conn) {
    return NextResponse.json({ connected: false, last_synced_at: null, sync_status: null, item_count: 0, customer_count: 0 });
  }

  const [{ count: item_count }, { count: customer_count }] = await Promise.all([
    supabase.from('square_items').select('id', { count: 'exact', head: true }).eq('business_id', business_id),
    supabase.from('square_customers').select('id', { count: 'exact', head: true }).eq('business_id', business_id),
  ]);

  return NextResponse.json({
    connected: true,
    last_synced_at: conn.last_synced_at,
    sync_status: conn.sync_status,
    item_count: item_count ?? 0,
    customer_count: customer_count ?? 0,
  });
}
