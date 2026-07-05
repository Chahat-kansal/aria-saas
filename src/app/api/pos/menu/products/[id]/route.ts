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

type Props = { params: { id: string } }

export async function GET(_req: Request, { params }: Props) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Fetch product
  const { data: product, error: productError } = await supabaseAdmin
    .from('pos_products')
    .select('*')
    .eq('id', id)
    .eq('business_id', bid)
    .maybeSingle()

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 })
  }
  if (!product) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fetch product-modifier-group links
  const { data: pmgRows, error: pmgError } = await supabaseAdmin
    .from('pos_product_modifier_groups')
    .select('group_id, display_order, override_required, override_min, override_max')
    .eq('product_id', id)
    .eq('business_id', bid)
    .order('display_order')

  if (pmgError) {
    return NextResponse.json({ error: pmgError.message }, { status: 500 })
  }

  const groupIds = (pmgRows ?? []).map((r: { group_id: string }) => r.group_id)

  let modifierGroups: unknown[] = []

  if (groupIds.length > 0) {
    // Fetch modifier groups
    const { data: groups, error: groupsError } = await supabaseAdmin
      .from('pos_modifier_groups')
      .select('id,name,selection_type,is_required,allow_quantity,min_selections,max_selections,display_order,color,archetype_slot')
      .in('id', groupIds)

    if (groupsError) {
      return NextResponse.json({ error: groupsError.message }, { status: 500 })
    }

    // Fetch modifiers
    const { data: modifiers, error: modifiersError } = await supabaseAdmin
      .from('pos_modifiers')
      .select('id,name,price_adjustment,is_active,is_default,allow_quantity,max_quantity,sort_order,kds_color,group_id')
      .in('group_id', groupIds)
      .order('sort_order')

    if (modifiersError) {
      return NextResponse.json({ error: modifiersError.message }, { status: 500 })
    }

    // Merge: attach override data and modifiers to each group
    modifierGroups = (groups ?? []).map((g: Record<string, unknown>) => {
      const link = (pmgRows ?? []).find((r: { group_id: string }) => r.group_id === g.id)
      const mods = (modifiers ?? []).filter((m: Record<string, unknown>) => m.group_id === g.id)
      return {
        ...g,
        override_required: link?.override_required ?? null,
        override_min: link?.override_min ?? null,
        override_max: link?.override_max ?? null,
        display_order: link?.display_order ?? g.display_order,
        modifiers: mods,
      }
    })
  }

  // Fetch variants
  const { data: variants, error: variantsError } = await supabaseAdmin
    .from('pos_product_variants')
    .select('id,name,price,sort_order,is_active')
    .eq('product_id', id)
    .order('sort_order')

  if (variantsError) {
    return NextResponse.json({ error: variantsError.message }, { status: 500 })
  }

  return NextResponse.json({ product, modifierGroups, variants: variants ?? [] })
}

export async function PATCH(req: Request, { params }: Props) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Verify product belongs to this business
  const { data: existing } = await supabaseAdmin
    .from('pos_products')
    .select('id')
    .eq('id', id)
    .eq('business_id', bid)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()

  const updateData: Record<string, unknown> = {}

  const allowedText = [
    'description', 'category_id', 'kds_station', 'notes', 'image_url',
    'image_thumb_url', 'image_source', 'ordering_mode', 'ordering_archetype',
    'builder_type',
  ]

  for (const field of allowedText) {
    if (body[field] !== undefined) {
      updateData[field] = body[field]
    }
  }

  if (body.name !== undefined) {
    updateData['name'] = String(body.name).trim().slice(0, 120)
  }

  if (body.price !== undefined) {
    updateData['price'] = Number(body.price) || 0
  }

  const allowedBool = ['is_active', 'show_online', 'is_gluten_free', 'is_vegan', 'is_vegetarian']
  for (const field of allowedBool) {
    if (body[field] !== undefined) {
      updateData[field] = Boolean(body[field])
    }
  }

  const allowedInt = ['prep_time_seconds', 'sort_order', 'display_order']
  for (const field of allowedInt) {
    if (body[field] !== undefined) {
      updateData[field] = Number(body[field])
    }
  }

  const allowedArrays = ['allergens', 'tags', 'online_images']
  for (const field of allowedArrays) {
    if (body[field] !== undefined) {
      updateData[field] = body[field]
    }
  }

  updateData['updated_at'] = new Date().toISOString()

  const { data: updated, error } = await supabaseAdmin
    .from('pos_products')
    .update(updateData)
    .eq('id', id)
    .eq('business_id', bid)
    .select('id,name,price,is_active,ordering_archetype,image_url,image_thumb_url')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ product: updated })
}

export async function DELETE(_req: Request, { params }: Props) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  const { error } = await supabaseAdmin
    .from('pos_products')
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('id', id)
    .eq('business_id', bid)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}