export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Accept business_id from query param (for multi-business support) or fall back to active business
  const qBid = new URL(req.url).searchParams.get('business_id')
  let bid: string | null = null
  if (qBid) {
    const { data: biz } = await supabase.from('businesses').select('id').eq('id', qBid).eq('user_id', user.id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    bid = qBid
  } else {
    bid = await getBid(supabase, user.id)
  }
  if (!bid) return NextResponse.json({ recipes: [] })

  const { data: recipes, error } = await supabaseAdmin
    .from('recipes')
    .select('*, recipe_ingredients(id, ingredient_name, quantity, unit, cost_cents, cost_per_unit, product_id, wastage_pct)')
    .eq('business_id', bid)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with computed fields
  const enriched = (recipes ?? []).map(r => {
    const ings = r.recipe_ingredients ?? []
    const ingredient_count = ings.length

    // Use total_cost from DB or compute from ingredients
    const total_cost: number | null = r.total_cost != null
      ? Number(r.total_cost)
      : ingredient_count > 0
        ? ings.reduce((s: number, i: { quantity: unknown; cost_per_unit: unknown; wastage_pct: unknown }) => {
            const cpu = Number(i.cost_per_unit ?? 0)
            const qty = Number(i.quantity ?? 0)
            const wastage = Number(i.wastage_pct ?? 0)
            return s + qty * cpu * (1 + wastage / 100)
          }, 0)
        : null

    const cost_per_serving = total_cost != null && r.yield_qty
      ? total_cost / Number(r.yield_qty)
      : r.cost_per_serve != null ? Number(r.cost_per_serve) : null

    // margin: use DB value or compute from menu_price
    const margin: number | null = r.margin != null
      ? Number(r.margin)
      : r.margin_percent != null
        ? Number(r.margin_percent)
        : r.menu_price != null && total_cost != null && Number(r.menu_price) > 0
          ? ((Number(r.menu_price) - (cost_per_serving ?? 0)) / Number(r.menu_price)) * 100
          : null

    const suggested_price: number | null = r.suggested_price != null
      ? Number(r.suggested_price)
      : total_cost != null && total_cost > 0 ? total_cost / 0.35 : null

    return {
      ...r,
      ingredient_count,
      total_cost,
      cost_per_serving,
      margin,
      suggested_price,
      last_costed_at: r.last_cost_updated_at ?? r.updated_at,
    }
  })

  return NextResponse.json({ recipes: enriched })
}

export const GET = withErrorCapture('pos/recipes', _GET)

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const {
    name, product_id, description, category, serves, prep_time_minutes,
    cost_cents, sell_price_cents, notes, ingredients, yield_qty, yield_unit,
    total_cost, source, allergens, linked_product_id, menu_price,
  } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const totalCostNum = total_cost != null ? Number(total_cost) : null
  const suggestedPrice = totalCostNum != null && totalCostNum > 0 ? totalCostNum / 0.35 : null
  const yieldQtyNum = yield_qty != null ? Number(yield_qty) : null
  const costPerServe = totalCostNum != null && yieldQtyNum && yieldQtyNum > 0 ? totalCostNum / yieldQtyNum : null
  const menuPriceNum = menu_price != null ? Number(menu_price) : null
  const marginPct = menuPriceNum && menuPriceNum > 0 && costPerServe != null
    ? ((menuPriceNum - costPerServe) / menuPriceNum) * 100
    : null

  const { data: recipe, error } = await supabase.from('recipes').insert({
    business_id: bid,
    name: name.trim(),
    product_id: product_id ?? null,
    description: description ?? null,
    category: category ?? null,
    serves: serves ?? 1,
    prep_time_minutes: prep_time_minutes ?? null,
    cost_cents: cost_cents ?? null,
    sell_price_cents: sell_price_cents ?? null,
    notes: notes ?? null,
    is_active: true,
    yield_qty: yieldQtyNum,
    yield_unit: yield_unit ?? null,
    total_cost: totalCostNum,
    cost_per_serve: costPerServe,
    menu_price: menuPriceNum,
    margin_percent: marginPct,
    margin: marginPct,
    suggested_price: suggestedPrice,
    allergens: allergens ?? [],
    linked_product_id: linked_product_id ?? null,
    source: source ?? 'manual',
    last_cost_updated_at: totalCostNum != null ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Array.isArray(ingredients) && ingredients.length > 0) {
    await supabase.from('recipe_ingredients').insert(
      ingredients.map((ing: {
        product_id?: string; ingredient_name?: string; quantity?: number; unit?: string;
        cost_cents?: number; cost_per_unit?: number; notes?: string; wastage_pct?: number;
      }) => ({
        recipe_id: recipe.id,
        business_id: bid,
        product_id: ing.product_id ?? null,
        ingredient_name: ing.ingredient_name ?? '',
        quantity: ing.quantity ?? 1,
        unit: ing.unit ?? null,
        cost_cents: ing.cost_cents ?? null,
        cost_per_unit: ing.cost_per_unit ?? null,
        wastage_pct: ing.wastage_pct ?? 0,
        notes: ing.notes ?? null,
        created_at: new Date().toISOString(),
      }))
    )
  }

  return NextResponse.json({ recipe })
}

export const POST = withBusinessContext('pos/recipes', _POST)

async function _DELETE(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
  const { error } = await supabase.from('recipes').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const DELETE = withBusinessContext('pos/recipes', _DELETE)
