export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { autoFetchProductImage } from '@/lib/pos/auto-fetch-image'

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

async function _GET(req: Request) {
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

  const { data: biz } = await supabase.from('businesses').select('name,industry,terminal_layout').eq('id', bid).maybeSingle();
  const [{ data: products }, { data: categories }, { data: saleKeys }] = await Promise.all([
    supabase
      .from('pos_products')
      .select('id,name,sku,barcode,description,price,cost_price,tax_rate,stock_quantity,low_stock_threshold,track_stock,is_active,show_online,image_url,builder_type,category_id,supplier_id,pos_categories(name,color)')
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
    business_type:     (biz as any)?.industry ?? null,
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

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;

  if (!body.name || !(body.name as string).trim()) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  // Explicit allowlist — only confirmed pos_products columns.
  // Unknown fields from callers are silently dropped here rather than
  // letting Supabase reject them with a 500.
  const insertPayload: Record<string, unknown> = {
    business_id: bid,
    name: (body.name as string).trim(),
    sku: body.sku ? (body.sku as string).trim() : generateSku(body.name as string),
    barcode: body.barcode ? String(body.barcode).trim() : null,
    description: body.description ? String(body.description).trim() : null,
    price: parseFloat(String(body.price ?? 0)) || 0,
    cost_price: body.cost_price != null ? (parseFloat(String(body.cost_price)) || null) : (body.cost != null ? parseFloat(String(body.cost)) || null : null),
    cost: body.cost != null ? parseFloat(String(body.cost)) || null : null,
    tax_rate: parseFloat(String(body.tax_rate ?? 10)) || 10,
    stock_quantity: parseInt(String(body.stock_quantity ?? 0)) || 0,
    low_stock_threshold: body.low_stock_threshold != null ? parseInt(String(body.low_stock_threshold)) || null : (body.reorder_point != null ? parseInt(String(body.reorder_point)) || null : null),
    track_stock: body.track_stock !== undefined ? !!body.track_stock : (body.track_inventory !== undefined ? !!body.track_inventory : true),
    track_inventory: body.track_inventory !== undefined ? !!body.track_inventory : (body.track_stock !== undefined ? !!body.track_stock : true),
    is_active: body.is_active !== undefined ? !!body.is_active : (body.active !== undefined ? !!body.active : true),
    status: body.status || 'draft',
    show_online: !!body.show_online,
    case_quantity: body.case_quantity != null ? parseInt(String(body.case_quantity)) || null : null,
    age_restricted: !!body.age_restricted,
    is_age_restricted: !!body.is_age_restricted,
    gst_exempt: !!body.gst_exempt,
    image_url: body.image_url || null,
    image_source: body.image_source || (body.image_url ? 'owner' : 'pending'),
    container_type: body.container_type || null,
    category_id: body.category_id || null,
    category: body.category || null,
    supplier_id: body.supplier_id || null,
    supplier_name: body.supplier_name || null,
    brand_id: body.brand_id || null,
    brand: body.brand || null,
    family_id: body.family_id || null,
    family: body.family || null,
    department: body.department || null,
    subdepartment: body.subdepartment || null,
    tags: body.tags || null,
    notes: body.notes || null,
    costing_method: body.costing_method || 'standard',
    purchase_uom: body.purchase_uom || null,
    purchase_uom_qty: body.purchase_uom_qty != null ? parseFloat(String(body.purchase_uom_qty)) || null : null,
    sell_uom: body.sell_uom || null,
    source: body.source || 'manual',
    loyalty_earn_rate: body.loyalty_earn_rate != null ? parseFloat(String(body.loyalty_earn_rate)) || null : null,
    loyalty_points_override: body.loyalty_points_override != null ? parseFloat(String(body.loyalty_points_override)) || null : null,
    reorder_point: body.reorder_point != null ? parseInt(String(body.reorder_point)) || null : null,
    reorder_qty: body.reorder_qty != null ? parseInt(String(body.reorder_qty)) || null : null,
    featured: !!body.featured,
    sort_order: body.sort_order != null ? parseInt(String(body.sort_order)) || 0 : 0,
    serial_tracked: !!body.serial_tracked,
    quality_hold: !!body.quality_hold,
    stocktake_frozen: !!body.stocktake_frozen,
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

  // Auto-create outlet inventory rows for all existing outlets
  const { data: outlets } = await supabase
    .from('pos_outlets')
    .select('id')
    .eq('business_id', bid)
  if (outlets?.length) {
    await supabase.from('pos_outlet_inventory').insert(
      outlets.map(o => ({
        business_id: bid,
        product_id: product.id,
        outlet_id: o.id,
      }))
    )
  }

  // Fire-and-forget: fetch an image if none was provided
  if (!body.image_url && product?.id) {
    const { data: bizInfo } = await supabase.from('businesses').select('industry').eq('id', bid).maybeSingle()
    autoFetchProductImage({
      productId:   product.id,
      productName: (body.name as string).trim(),
      industry:    bizInfo?.industry ?? null,
      businessId:  bid,
    })
  }

  return NextResponse.json({ product });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;

  // Explicit allowlist — same set as POST. Raw body spread is rejected by Supabase
  // when any key doesn't map to a real column, so we pick only known columns.
  const patchable = [
    'name','sku','barcode','description','price','cost_price','cost','tax_rate',
    'stock_quantity','low_stock_threshold','track_stock','track_inventory',
    'is_active','status','show_online','case_quantity','age_restricted',
    'is_age_restricted','gst_exempt','image_url','image_source','container_type',
    'category_id','category','supplier_id','supplier_name','brand_id','brand',
    'family_id','family','department','subdepartment','tags','notes',
    'costing_method','purchase_uom','purchase_uom_qty','sell_uom','source',
    'loyalty_earn_rate','loyalty_points_override','reorder_point','reorder_qty',
    'featured','sort_order','serial_tracked','quality_hold','stocktake_frozen',
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of patchable) {
    if (key in body) updates[key] = body[key];
  }
  // Alias handling
  if ('active' in body) updates.is_active = !!body.active;

  const { error } = await supabase
    .from('pos_products')
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
    .from('pos_products')
    .delete()
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/products', _GET)
export const POST = withErrorCapture('pos/products', _POST)
export const PATCH = withErrorCapture('pos/products', _PATCH)
export const DELETE = withErrorCapture('pos/products', _DELETE)
