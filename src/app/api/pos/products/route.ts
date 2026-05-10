export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ products: [], categories: [], sale_keys: [] });

  const { searchParams } = new URL(req.url);
  const singleId = searchParams.get('id');

  // Single product fetch (for edit page)
  if (singleId) {
    const { data: product, error } = await supabase
      .from('pos_products')
      .select('id,name,sku,barcode,description,price,cost_price,tax_rate,stock_quantity,low_stock_threshold,track_stock,is_active,show_online,image_url,category_id,supplier_id,brand_id,family_id,loyalty_earn_rate,case_quantity,is_age_restricted,pos_categories(name,color)')
      .eq('id', singleId)
      .eq('business_id', bid)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: categories } = await supabase.from('pos_categories').select('*').eq('business_id', bid).order('name');
    return NextResponse.json({
      business_id: bid,
      products: product ? [product] : [],
      categories: categories || [],
      sale_keys: [],
    });
  }

  const { data: biz } = await supabase.from('businesses').select('name,business_type,terminal_layout').eq('id', bid).maybeSingle();
  const [{ data: products }, { data: categories }, { data: saleKeys }] = await Promise.all([
    supabase
      .from('pos_products')
      .select('id,name,sku,barcode,description,price,cost_price,tax_rate,stock_quantity,low_stock_threshold,track_stock,is_active,show_online,image_url,category_id,supplier_id,pos_categories(name,color)')
      .eq('business_id', bid)
      .order('name'),
    supabase
      .from('pos_categories')
      .select('*')
      .eq('business_id', bid)
      .order('name'),
    supabase
      .from('pos_sale_keys')
      .select('*')
      .eq('business_id', bid)
      .order('position'),
  ]);

  return NextResponse.json({
    business_id:       bid,
    business_name:     biz?.name ?? 'AriaPOS',
    business_type:     (biz as any)?.business_type ?? null,
    terminal_layout:   (biz as any)?.terminal_layout ?? null,
    products:          products   || [],
    categories:        categories || [],
    sale_keys:         saleKeys   || [],
  });
}

function generateSku(name: string): string {
  const slug = (name ?? 'product').slice(0, 8).replace(/[^a-z0-9]/gi, '').toUpperCase();
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  return `${slug}-${stamp}`;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;

  if (!body.name || !(body.name as string).trim()) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  // Sanitised payload — only known pos_products columns
  const insertPayload: Record<string, unknown> = {
    business_id: bid,
    name: (body.name as string).trim(),
    sku: body.sku ? (body.sku as string).trim() : generateSku(body.name as string),
    barcode: body.barcode ? (body.barcode as string).trim() : null,
    description: body.description ? (body.description as string).trim() : null,
    price: parseFloat(String(body.price)) || 0,
    cost_price: parseFloat(String(body.cost_price ?? body.cost ?? 0)) || 0,
    tax_rate: parseFloat(String(body.tax_rate ?? 10)) || 10,
    stock_quantity: parseInt(String(body.stock_quantity ?? 0)) || 0,
    low_stock_threshold: parseInt(String(body.low_stock_threshold ?? body.reorder_point ?? 5)) || 5,
    track_stock: body.track_stock !== undefined ? !!body.track_stock : true,
    is_active: body.is_active !== undefined ? !!body.is_active : (body.active !== undefined ? !!body.active : true),
    case_quantity: parseInt(String(body.case_quantity ?? 1)) || 1,
    is_age_restricted: !!body.is_age_restricted,
    image_url: body.image_url || null,
    image_source: body.image_url ? 'owner' : 'pending',
    container_type: body.container_type ?? 'unknown',
    category_id: body.category_id || null,
    supplier_id: body.supplier_id || null,
  };

  const { data: product, error } = await supabase
    .from('pos_products')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('[products POST]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ product });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { error } = await supabase
    .from('pos_products')
    .update(body)
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('pos_products')
    .delete()
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
