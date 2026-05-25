export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { recipe_import_id, businessId } = body as { recipe_import_id?: string; businessId?: string }
  if (!recipe_import_id || !businessId) {
    return NextResponse.json({ error: 'recipe_import_id and businessId required' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: imp } = await supabaseAdmin.from('recipe_imports')
    .select('extracted_title, extracted_ingredients, extracted_steps')
    .eq('id', recipe_import_id).eq('business_id', businessId).single()
  if (!imp) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  type Ingredient = { item?: string; quantity?: string; unit?: string }
  const ings = (imp.extracted_ingredients as Ingredient[] | null) ?? []
  const steps = (imp.extracted_steps as string[] | null) ?? []
  const ingText = ings.map(i => [i.item, i.quantity, i.unit].filter(Boolean).join(' ')).join(', ')
  const stepText = steps.map((s, i) => `${i + 1}. ${s}`).join(' ')
  const description = [ingText ? 'Ingredients: ' + ingText : '', stepText].filter(Boolean).join(' | ')

  const { data: product, error: insErr } = await supabaseAdmin.from('pos_products').insert({
    business_id: businessId,
    name: imp.extracted_title ?? 'Imported recipe',
    description: description || null,
    category: 'Recipe',
    price: 0,
    is_active: true,
    source: 'recipe_import',
  }).select().single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await supabaseAdmin.from('recipe_imports')
    .update({ status: 'added_as_product', linked_product_id: product.id })
    .eq('id', recipe_import_id)
    .catch(() => {/* non-fatal */})

  return NextResponse.json({ product })
}

export const POST = withErrorCapture('recipes/add-to-products', _POST)
