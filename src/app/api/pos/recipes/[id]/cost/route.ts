export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: recipe } = await supabase.from('recipes').select('id, business_id, product_id').eq('id', params.id).maybeSingle()
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', recipe.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ingredients } = await supabaseAdmin
    .from('recipe_ingredients')
    .select('id, ingredient_name, quantity, unit, cost_per_unit, product_id')
    .eq('recipe_id', params.id)

  if (!ingredients || ingredients.length === 0) {
    return NextResponse.json({ total_cost: 0, ingredients: [], margin: null })
  }

  let totalCost = 0
  const updated: Array<{ id: string; cost_per_unit: number | null }> = []

  for (const ing of ingredients) {
    let cpu = ing.cost_per_unit != null ? Number(ing.cost_per_unit) : null
    if (ing.product_id) {
      const { data: prod } = await supabaseAdmin.from('pos_products').select('price').eq('id', ing.product_id).maybeSingle()
      if (prod?.price != null) cpu = Number(prod.price)
    }
    if (cpu != null) {
      totalCost += Number(ing.quantity) * cpu
      updated.push({ id: ing.id, cost_per_unit: cpu })
    }
  }

  // Persist refreshed costs
  for (const u of updated) {
    await supabaseAdmin.from('recipe_ingredients').update({ cost_per_unit: u.cost_per_unit, cost_cents: Math.round((u.cost_per_unit ?? 0) * 100) }).eq('id', u.id)
  }

  // Update recipe total_cost + margin if linked product exists
  let margin: number | null = null
  if (recipe.product_id) {
    const { data: prod } = await supabaseAdmin.from('pos_products').select('price').eq('id', recipe.product_id).maybeSingle()
    if (prod?.price != null) {
      const price = Number(prod.price)
      margin = price > 0 ? ((price - totalCost) / price) * 100 : null
    }
  }

  await supabaseAdmin.from('recipes').update({
    total_cost: totalCost,
    margin: margin ?? undefined,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  return NextResponse.json({ total_cost: totalCost, margin, ingredients: updated })
}

export const GET = withErrorCapture('pos/recipes/[id]/cost', _GET)
