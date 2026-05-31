export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 60;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
export const maxDuration = 30;
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { autoFetchProductImage } from '@/lib/pos/auto-fetch-image'
import { z } from 'zod'
import { validateBody } from '@/lib/api/validate'

const ProductBodySchema = z.object({ name: z.string().min(1).max(500) }).passthrough()

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
      .select('id,name,sku,barcode,description,price,cost_price,tax_rate,tax_code_id,additional_tax_code_ids,stock_quantity,low_stock_threshold,track_stock,is_active,show_online,image_url,category_id,supplier_id,brand_id,family_id,loyalty_earn_rate,case_quantity,is_age_restricted,is_weight_based,price_per_kg,serial_tracked,is_schedule_drug,schedule_level,requires_script,pos_categories(name,color)')
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
      .select('id,name,sku,barcode,price,cost_price,tax_rate,tax_code_id,additional_tax_code_ids,stock_quantity,low_stock_threshold,track_stock,is_active,image_url,builder_type,category_id,alcohol_percentage,is_age_restricted,is_weight_based,price_per_kg,serial_tracked,is_schedule_drug,schedule_level,requires_script,pos_categories(name,color)')
      .eq('business_id', bid)
      .order('name')
      .limit(5000),
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

  const parsed = await validateBody(req, ProductBodySchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data as Record<string, unknown>

  // Price validation — block $0 products (prevents silent $0 duplicates)
  const priceVal = body.price !== undefined && body.price !== null && body.price !== ''
    ? parseFloat(String(body.price))
    : null;
  if (priceVal !== null && priceVal <= 0) {
    return NextResponse.json({ error: 'price_required', message: 'Price must be greater than $0' }, { status: 400 });
  }

  // 30-second deduplication — prevent double-submit creating identical products
  const { data: recentDup } = await supabase.from('pos_products')
    .select('id, name')
    .eq('business_id', bid)
    .eq('name', (body.name as string).trim())
    .gte('created_at', new Date(Date.now() - 30000).toISOString())
    .maybeSingle();
  if (recentDup) return NextResponse.json({ product: recentDup, duplicate: true });

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
    tax_code_id: body.tax_code_id || null,
    additional_tax_code_ids: Array.isArray(body.additional_tax_code_ids) ? body.additional_tax_code_ids : [],
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
    // Industry-specific fields
    colour: body.colour ? String(body.colour) : null,
    size: body.size ? String(body.size) : null,
    gender: body.gender ? String(body.gender) : null,
    material: body.material ? String(body.material) : null,
    fit_type: body.fit_type ? String(body.fit_type) : null,
    vintage: body.vintage ? parseInt(String(body.vintage)) || null : null,
    alcohol_percentage: body.alcohol_percentage != null ? parseFloat(String(body.alcohol_percentage)) || null : null,
    standard_drinks: body.standard_drinks != null ? parseFloat(String(body.standard_drinks)) || null : null,
    volume: body.volume != null ? parseFloat(String(body.volume)) || null : null,
    volume_unit: body.volume_unit ? String(body.volume_unit) : 'ml',
    country_of_origin: body.country_of_origin ? String(body.country_of_origin) : null,
    allergens: Array.isArray(body.allergens) ? body.allergens : [],
    shelf_life_days: body.shelf_life_days != null ? parseInt(String(body.shelf_life_days)) || null : null,
    storage_temp: body.storage_temp ? String(body.storage_temp) : null,
    ingredients: body.ingredients ? String(body.ingredients) : null,
    expiry_date: body.expiry_date ? String(body.expiry_date) : null,
    prep_time_seconds: body.prep_time_seconds != null ? parseInt(String(body.prep_time_seconds)) || null : null,
    course_type: body.course_type ? String(body.course_type) : null,
    kds_station: body.kds_station ? String(body.kds_station) : 'barista',
    is_gluten_free: !!body.is_gluten_free,
    is_vegan: !!body.is_vegan,
    is_vegetarian: !!body.is_vegetarian,
    is_weight_based: !!body.is_weight_based,
    price_per_kg: body.price_per_kg != null ? parseFloat(String(body.price_per_kg)) || null : null,
    schedule_level: body.schedule_level ? String(body.schedule_level) : null,
    requires_script: !!body.requires_script,
    is_schedule_drug: !!body.is_schedule_drug,
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

  const rawBody = await req.json().catch(() => null)
  if (!rawBody || typeof rawBody !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const body = rawBody as Record<string, unknown>

  // Explicit allowlist — same set as POST. Raw body spread is rejected by Supabase
  // when any key doesn't map to a real column, so we pick only known columns.
  const patchable = [
    'name','sku','barcode','description','price','cost_price','cost','tax_rate',
    'tax_code_id','additional_tax_code_ids',
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
