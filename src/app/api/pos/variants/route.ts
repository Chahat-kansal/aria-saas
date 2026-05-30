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
  const mode = searchParams.get('mode');

  // counts mode — returns { [product_id]: count } for all variants in this business
  if (mode === 'counts') {
    const { data } = await supabase
      .from('pos_product_variants')
      .select('product_id')
      .eq('business_id', bid)
      .eq('is_active', true);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.product_id) counts[row.product_id] = (counts[row.product_id] ?? 0) + 1;
    }
    return NextResponse.json({ counts });
  }

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
      .from('pos_product_modifier_groups')
      .select('*, pos_modifier_groups(*)')
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

  const { product_id, name, price, barcode, sku, stock_quantity, sort_order } = await req.json();
  if (!product_id || !name) return NextResponse.json({ error: 'product_id and name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('pos_product_variants')
    .insert({
      product_id,
      name,
      price: price != null ? parseFloat(String(price)) || null : null,
      barcode: barcode ? String(barcode).trim() : null,
      sku: sku ? String(sku).trim() : null,
      stock_quantity: stock_quantity != null ? parseInt(String(stock_quantity)) || 0 : 0,
      sort_order: sort_order ?? 0,
      business_id: bid,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ variant: data });
}

async function _PUT(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.price !== undefined) updates.price = body.price != null ? parseFloat(String(body.price)) || null : null;
  if (body.barcode !== undefined) updates.barcode = body.barcode ? String(body.barcode).trim() : null;
  if (body.sku !== undefined) updates.sku = body.sku ? String(body.sku).trim() : null;
  if (body.stock_quantity !== undefined) updates.stock_quantity = parseInt(String(body.stock_quantity)) || 0;
  if (body.is_active !== undefined) updates.is_active = !!body.is_active;
  if (body.sort_order !== undefined) updates.sort_order = parseInt(String(body.sort_order)) || 0;

  const { error } = await supabase
    .from('pos_product_variants')
    .update(updates)
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
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

export const GET    = withErrorCapture('pos/variants', _GET)
export const POST   = withErrorCapture('pos/variants', _POST)
export const PUT    = withErrorCapture('pos/variants', _PUT)
export const DELETE = withErrorCapture('pos/variants', _DELETE)
