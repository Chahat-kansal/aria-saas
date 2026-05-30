export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function ownerRecipe(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, id: string) {
  const { data: recipe } = await supabase
    .from('recipes')
    .select('id, business_id')
    .eq('id', id)
    .maybeSingle()
  if (!recipe) return null
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', recipe.business_id).eq('user_id', userId).maybeSingle()
  return biz ? recipe : null
}

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const recipe = await ownerRecipe(supabase, user.id, params.id)
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: full } = await supabaseAdmin
    .from('recipes')
    .select('*, recipe_ingredients(*, pos_products(id, name, price))')
    .eq('id', params.id)
    .maybeSingle()

  return NextResponse.json({ recipe: full ?? null })
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await ownerRecipe(supabase, user.id, params.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { name, yield_qty, yield_unit, notes, linked_product_id, total_cost } = body as {
    name?: string
    yield_qty?: number | null
    yield_unit?: string | null
    notes?: string | null
    linked_product_id?: string | null
    total_cost?: number | null
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name?.trim() || undefined
  if (yield_qty !== undefined) updates.yield_qty = yield_qty
  if (yield_unit !== undefined) updates.yield_unit = yield_unit
  if (notes !== undefined) updates.notes = notes
  if (total_cost !== undefined) updates.total_cost = total_cost
  if (linked_product_id !== undefined) {
    updates.product_id = linked_product_id
    if (linked_product_id && total_cost !== undefined && total_cost != null) {
      const { data: prod } = await supabaseAdmin.from('pos_products').select('price').eq('id', linked_product_id).maybeSingle()
      if (prod?.price != null) {
        const price = Number(prod.price)
        const cost = Number(total_cost)
        updates.margin = price > 0 ? ((price - cost) / price) * 100 : null
      }
    } else if (linked_product_id) {
      const { data: rec } = await supabaseAdmin.from('recipes').select('total_cost').eq('id', params.id).maybeSingle()
      const { data: prod } = await supabaseAdmin.from('pos_products').select('price').eq('id', linked_product_id).maybeSingle()
      if (rec?.total_cost != null && prod?.price != null) {
        const price = Number(prod.price)
        const cost = Number(rec.total_cost)
        updates.margin = price > 0 ? ((price - cost) / price) * 100 : null
      }
    } else {
      updates.margin = null
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('recipes')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recipe: updated })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await ownerRecipe(supabase, user.id, params.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('recipes').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/recipes/[id]', _GET)
export const PATCH = withErrorCapture('pos/recipes/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/recipes/[id]', _DELETE)
