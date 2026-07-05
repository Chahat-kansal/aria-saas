import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

// Auth helper: verifies user owns business
async function getBid(): Promise<string | null> {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Try user_active_business first, then fall back to businesses table
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (biz?.id as string | null) ?? null
}

export async function GET(_request: Request): Promise<NextResponse> {
  const bid = await getBid()
  if (!bid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [productsResult, categoriesResult, outletsResult] = await Promise.all([
    supabaseAdmin
      .from('pos_products')
      .select(
        'id, name, description, price, category_id, is_active, show_online, ordering_mode, ordering_archetype, builder_type, kds_station, prep_time_seconds, allergens, is_gluten_free, is_vegan, is_vegetarian, notes, tags, image_url, image_thumb_url, image_source, sort_order, display_order'
      )
      .eq('business_id', bid)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),

    supabaseAdmin
      .from('pos_categories')
      .select('id, name, color, is_active, sort_order, ordering_archetype')
      .eq('business_id', bid),

    supabaseAdmin
      .from('pos_outlets')
      .select('id, name')
      .eq('business_id', bid),
  ])

  if (productsResult.error) {
    return NextResponse.json({ error: productsResult.error.message }, { status: 500 })
  }
  if (categoriesResult.error) {
    return NextResponse.json({ error: categoriesResult.error.message }, { status: 500 })
  }
  if (outletsResult.error) {
    return NextResponse.json({ error: outletsResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    products: productsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    outlets: outletsResult.data ?? [],
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  const bid = await getBid()
  if (!bid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const price = body.price !== undefined && body.price !== null ? Number(body.price) : undefined

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (price === undefined || isNaN(price)) {
    return NextResponse.json({ error: 'price is required' }, { status: 400 })
  }

  const insertPayload = {
    business_id: bid,
    name: name.slice(0, 120),
    description: typeof body.description === 'string' ? body.description.trim() || null : null,
    price: price || 0,
    category_id: body.category_id ? String(body.category_id) : null,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    show_online: typeof body.show_online === 'boolean' ? body.show_online : true,
    ordering_mode: typeof body.ordering_mode === 'string' ? body.ordering_mode : 'inherit',
    ordering_archetype: typeof body.ordering_archetype === 'string' ? body.ordering_archetype : null,
    builder_type: typeof body.builder_type === 'string' ? body.builder_type : null,
    kds_station: typeof body.kds_station === 'string' ? body.kds_station : 'barista',
    prep_time_seconds: body.prep_time_seconds !== undefined && body.prep_time_seconds !== null
      ? Number(body.prep_time_seconds)
      : null,
    allergens: Array.isArray(body.allergens) ? body.allergens as string[] : [],
    is_gluten_free: typeof body.is_gluten_free === 'boolean' ? body.is_gluten_free : false,
    is_vegan: typeof body.is_vegan === 'boolean' ? body.is_vegan : false,
    is_vegetarian: typeof body.is_vegetarian === 'boolean' ? body.is_vegetarian : false,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    tags: Array.isArray(body.tags) ? body.tags as string[] : [],
    sort_order: body.sort_order !== undefined && body.sort_order !== null
      ? Number(body.sort_order) || 0
      : 0,
    image_source: 'manual',
  }

  const { data, error } = await supabaseAdmin
    .from('pos_products')
    .insert(insertPayload)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ product: data }, { status: 201 })
}