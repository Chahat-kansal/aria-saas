export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ recipes: [] })

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(id, ingredient_name, quantity, unit, cost_cents, cost_per_unit, product_id)')
    .eq('business_id', bid)
    .eq('is_active', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recipes: recipes ?? [] })
}

export const GET = withErrorCapture('pos/recipes', _GET)

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { name, product_id, description, category, serves, prep_time_minutes, cost_cents, sell_price_cents, notes, ingredients, yield_qty, yield_unit, total_cost, source } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data: recipe, error } = await supabase.from('recipes').insert({
    business_id: bid, name: name.trim(), product_id: product_id ?? null,
    description: description ?? null, category: category ?? null,
    serves: serves ?? 1, prep_time_minutes: prep_time_minutes ?? null,
    cost_cents: cost_cents ?? null, sell_price_cents: sell_price_cents ?? null,
    notes: notes ?? null, is_active: true,
    yield_qty: yield_qty ?? null, yield_unit: yield_unit ?? null,
    total_cost: total_cost ?? null, source: source ?? 'manual',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert ingredients if provided
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    await supabase.from('recipe_ingredients').insert(
      ingredients.map((ing: { product_id?: string; ingredient_name?: string; quantity?: number; unit?: string; cost_cents?: number; cost_per_unit?: number; notes?: string }) => ({
        recipe_id: recipe.id, business_id: bid,
        product_id: ing.product_id ?? null,
        ingredient_name: ing.ingredient_name ?? '',
        quantity: ing.quantity ?? 1, unit: ing.unit ?? null,
        cost_cents: ing.cost_cents ?? null,
        cost_per_unit: ing.cost_per_unit ?? null,
        notes: ing.notes ?? null,
        created_at: new Date().toISOString(),
      }))
    )
  }

  return NextResponse.json({ recipe })
}

export const POST = withErrorCapture('pos/recipes', _POST)

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
  const { error } = await supabase.from('recipes').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const DELETE = withErrorCapture('pos/recipes', _DELETE)