export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: recipe } = await supabase.from('recipes').select('id, business_id, yield_qty').eq('id', params.id).maybeSingle()
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', recipe.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { servings } = body as { servings?: number }
  if (!servings || servings <= 0) return NextResponse.json({ error: 'servings must be > 0' }, { status: 400 })

  const originalYield = recipe.yield_qty ? Number(recipe.yield_qty) : 1
  const factor = servings / originalYield

  const { data: ingredients } = await supabaseAdmin
    .from('recipe_ingredients')
    .select('id, ingredient_name, quantity, unit, cost_per_unit, wastage_pct')
    .eq('recipe_id', params.id)

  if (!ingredients || ingredients.length === 0) {
    return NextResponse.json({ error: 'No ingredients to scale' }, { status: 400 })
  }

  const scaled = ingredients.map(ing => {
    const newQty = Number(ing.quantity) * factor
    const cpu = ing.cost_per_unit != null ? Number(ing.cost_per_unit) : null
    const wastage = ing.wastage_pct != null ? Number(ing.wastage_pct) : 0
    const effectiveCpu = cpu != null ? cpu * (1 + wastage / 100) : null
    return {
      id: ing.id,
      ingredient_name: ing.ingredient_name,
      quantity: Math.round(newQty * 1000) / 1000,
      unit: ing.unit,
      cost_per_unit: cpu,
      wastage_pct: wastage,
      effective_cost_per_unit: effectiveCpu,
      line_cost: effectiveCpu != null ? effectiveCpu * newQty : null,
    }
  })

  const totalCost = scaled.reduce((s, i) => s + (i.line_cost ?? 0), 0)
  const costPerServing = servings > 0 ? totalCost / servings : null

  return NextResponse.json({
    original_yield: originalYield,
    scaled_servings: servings,
    scale_factor: factor,
    ingredients: scaled,
    total_cost: Math.round(totalCost * 10000) / 10000,
    cost_per_serving: costPerServing != null ? Math.round(costPerServing * 10000) / 10000 : null,
  })
}

export const POST = withErrorCapture('pos/recipes/[id]/scale', _POST)
