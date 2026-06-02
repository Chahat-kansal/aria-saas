export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function ownerRecipe(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, id: string) {
  const { data: recipe } = await supabase.from('recipes').select('id, business_id').eq('id', id).maybeSingle()
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

  if (!full) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Compute enriched fields
  const ings = (full.recipe_ingredients ?? []) as Array<{
    quantity: unknown; cost_per_unit: unknown; wastage_pct: unknown
  }>
  const ingredient_count = ings.length
  const total_cost = full.total_cost != null ? Number(full.total_cost) : null
  const cost_per_serving = total_cost != null && full.yield_qty
    ? total_cost / Number(full.yield_qty)
    : full.cost_per_serve != null ? Number(full.cost_per_serve) : null
  const margin = full.margin != null ? Number(full.margin) : full.margin_percent != null ? Number(full.margin_percent) : null
  const suggested_price = full.suggested_price != null
    ? Number(full.suggested_price)
    : total_cost != null && total_cost > 0 ? total_cost / 0.35 : null

  return NextResponse.json({ recipe: { ...full, ingredient_count, cost_per_serving, margin, suggested_price } })
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await ownerRecipe(supabase, user.id, params.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const {
    name, yield_qty, yield_unit, notes, linked_product_id, total_cost,
    category, allergens, menu_price, serves,
  } = body as {
    name?: string
    yield_qty?: number | null
    yield_unit?: string | null
    notes?: string | null
    linked_product_id?: string | null
    total_cost?: number | null
    category?: string | null
    allergens?: string[] | null
    menu_price?: number | null
    serves?: number | null
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name?.trim() || undefined
  if (yield_qty !== undefined) updates.yield_qty = yield_qty
  if (yield_unit !== undefined) updates.yield_unit = yield_unit
  if (notes !== undefined) updates.notes = notes
  if (category !== undefined) updates.category = category
  if (allergens !== undefined) updates.allergens = allergens
  if (serves !== undefined) updates.serves = serves
  if (menu_price !== undefined) updates.menu_price = menu_price

  // When total_cost changes, recalculate suggested_price + last_cost_updated_at
  if (total_cost !== undefined && total_cost != null) {
    updates.total_cost = total_cost
    updates.suggested_price = total_cost > 0 ? total_cost / 0.35 : null
    updates.last_cost_updated_at = new Date().toISOString()

    // Recalculate cost_per_serve
    const yqVal = yield_qty !== undefined ? yield_qty : null
    if (yqVal && yqVal > 0) {
      updates.cost_per_serve = Number(total_cost) / Number(yqVal)
    }
  }

  // When linked_product_id changes, compute margin
  if (linked_product_id !== undefined) {
    // Store in both product_id (legacy) and linked_product_id
    updates.product_id = linked_product_id
    updates.linked_product_id = linked_product_id

    if (linked_product_id) {
      // Get current recipe total_cost if not being updated
      const costToUse = total_cost !== undefined && total_cost != null
        ? Number(total_cost)
        : await (async () => {
            const { data: rec } = await supabaseAdmin.from('recipes').select('total_cost').eq('id', params.id).maybeSingle()
            return rec?.total_cost != null ? Number(rec.total_cost) : null
          })()

      const { data: prod } = await supabaseAdmin.from('pos_products').select('price').eq('id', linked_product_id).maybeSingle()

      if (prod?.price != null && costToUse != null) {
        const price = Number(prod.price)
        const marginPct = price > 0 ? ((price - costToUse) / price) * 100 : null
        updates.margin = marginPct
        updates.margin_percent = marginPct

        // Auto-set suggested_price if not already set
        if (updates.suggested_price === undefined && costToUse > 0) {
          updates.suggested_price = costToUse / 0.35
        }
      }
    } else {
      updates.margin = null
      updates.margin_percent = null
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('recipes')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute enriched return fields
  const tc = updated.total_cost != null ? Number(updated.total_cost) : null
  const costPerServing = tc != null && updated.yield_qty
    ? tc / Number(updated.yield_qty)
    : updated.cost_per_serve != null ? Number(updated.cost_per_serve) : null
  const margin = updated.margin != null ? Number(updated.margin) : updated.margin_percent != null ? Number(updated.margin_percent) : null
  const suggestedPrice = updated.suggested_price != null ? Number(updated.suggested_price) : tc != null && tc > 0 ? tc / 0.35 : null

  return NextResponse.json({ recipe: { ...updated, cost_per_serving: costPerServing, margin, suggested_price: suggestedPrice } })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await ownerRecipe(supabase, user.id, params.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('recipes').update({
    is_active: false,
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/recipes/[id]', _GET)
export const PATCH = withErrorCapture('pos/recipes/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/recipes/[id]', _DELETE)
