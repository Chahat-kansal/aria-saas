import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

// Auth helper: verifies user owns business
async function getBid() {
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

export async function GET() {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: categories, error: catErr } = await supabaseAdmin
    .from('pos_categories')
    .select('id, name, color, is_active, sort_order, ordering_archetype')
    .eq('business_id', bid)
    .order('sort_order', { ascending: true })

  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 })

  const { data: products, error: prodErr } = await supabaseAdmin
    .from('pos_products')
    .select('category_id')
    .eq('business_id', bid)
    .is('deleted_at', null)
    .eq('is_active', true)

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

  const countMap: Record<string, number> = {}
  for (const p of products ?? []) {
    if (p.category_id) {
      countMap[p.category_id] = (countMap[p.category_id] ?? 0) + 1
    }
  }

  const result = (categories ?? []).map((c) => ({
    ...c,
    product_count: countMap[c.id] ?? 0,
  }))

  return NextResponse.json({ categories: result })
}

export async function POST(req: Request) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('pos_categories')
    .insert({
      business_id: bid,
      name,
      color: body.color ?? '#6366f1',
      ordering_archetype: body.ordering_archetype ?? null,
      sort_order: body.sort_order ?? 0,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof fields.name === 'string') updates.name = fields.name.trim().slice(0, 60)
  if (typeof fields.color === 'string') updates.color = fields.color
  if (typeof fields.is_active === 'boolean') updates.is_active = fields.is_active
  if (typeof fields.sort_order === 'number') updates.sort_order = fields.sort_order
  if ('ordering_archetype' in fields) updates.ordering_archetype = fields.ordering_archetype ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('pos_categories')
    .update(updates)
    .eq('id', id)
    .eq('business_id', bid)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error: reassignErr } = await supabaseAdmin
    .from('pos_products')
    .update({ category_id: null })
    .eq('category_id', id)
    .eq('business_id', bid)

  if (reassignErr) return NextResponse.json({ error: reassignErr.message }, { status: 500 })

  const { error: deleteErr } = await supabaseAdmin
    .from('pos_categories')
    .delete()
    .eq('id', id)
    .eq('business_id', bid)

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}