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

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ future_prices: [] });

  // Auto-apply any due prices
  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await supabase.from('pos_future_prices')
    .select('*').eq('business_id', bid).eq('applied', false).lte('effective_date', today);
  if (due?.length) {
    for (const fp of due) {
      // SECURITY-CRITICAL-1 — scoped to bid, not id alone (BUG-HUNT-1 Tier 0.5): the pos_future_prices
      // row itself was already business-scoped above, but this write's own filter wasn't — a crafted
      // product_id pointing at another tenant's product would have silently overwritten its live price.
      await supabase.from('pos_products').update({ price: fp.new_price }).eq('id', fp.product_id).eq('business_id', bid);
      await supabase.from('pos_future_prices').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', fp.id);
    }
  }

  const { data } = await supabase.from('pos_future_prices')
    .select('*, pos_products(id, name, price)').eq('business_id', bid).order('effective_date');
  return NextResponse.json({ future_prices: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { product_id, new_price, effective_date } = await req.json();
  if (!product_id || !new_price || !effective_date) return NextResponse.json({ error: 'product_id, new_price, effective_date required' }, { status: 400 });
  // SECURITY-CRITICAL-1 — verify product_id belongs to bid before scheduling a price change for it,
  // not just at auto-apply time (defense in depth alongside the GET-side fix above).
  const { data: product } = await supabase.from('pos_products').select('price').eq('id', product_id).eq('business_id', bid).maybeSingle();
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  const { data, error } = await supabase.from('pos_future_prices').insert({
    business_id: bid, product_id, new_price, effective_date,
    current_price: product?.price ?? null, applied: false,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ future_price: data });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('pos_future_prices').delete().eq('id', id).eq('business_id', bid);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/future-prices', _GET)
export const POST = withErrorCapture('pos/future-prices', _POST)
export const DELETE = withErrorCapture('pos/future-prices', _DELETE)
