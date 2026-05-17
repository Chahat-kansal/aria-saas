export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ history: [] });
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('product_id');
  if (!productId) return NextResponse.json({ error: 'product_id required' }, { status: 400 });

  const { data } = await supabase
    .from('pos_inventory_transfer_items')
    .select(`
      id, quantity_requested, quantity_sent, quantity_received, variance_units, unit_cost,
      pos_inventory_transfers!inner(id, transfer_number, status, from_outlet_id, to_outlet_id, business_id, shipped_at, received_at, reconciled_at)
    `)
    .eq('product_id', productId)
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ history: data ?? [] });
}

export const GET = withErrorCapture('pos/transfers/history', _GET);
