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
  if (!bid) return NextResponse.json({ variants: [], modifiers: [] });

  const { searchParams } = new URL(req.url);
  const product_id = searchParams.get('product_id');
  if (!product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 });

  const [variantsRes, modifiersRes, groupsRes] = await Promise.all([
    supabase
      .from('pos_product_variants')
      .select('*')
      .eq('product_id', product_id)
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('pos_product_modifiers')
      .select('*, pos_modifiers(*)')
      .eq('product_id', product_id)
      .eq('business_id', bid),
    supabase
      .from('pos_product_variant_groups')
      .select('*')
      .eq('product_id', product_id)
      .eq('business_id', bid)
      .order('sort_order'),
  ]);

  return NextResponse.json({
    variants: groupsRes.data?.length ? groupsRes.data : (variantsRes.data ?? []),
    modifiers: modifiersRes.data ?? [],
  });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { product_id, name, values, affects_price, price_map } = await req.json();
  if (!product_id || !name) return NextResponse.json({ error: 'product_id and name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('pos_product_variants')
    .insert({ product_id, name, values: values ?? [], affects_price: affects_price ?? false, price_map: price_map ?? {}, business_id: bid })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ variant: data });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('pos_product_variants')
    .delete()
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/variants', _GET)
export const POST = withErrorCapture('pos/variants', _POST)
export const DELETE = withErrorCapture('pos/variants', _DELETE)
