export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { parseLLMJsonOr } from '@/lib/ai-json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface RecipeCard {
  recipe_name: string
  ingredients: string[]
  one_liner: string
  matched_products: Array<{ id: string; name: string; price: number | null }>
}

export async function POST(req: Request) {
  try {
    const { business_id, query } = await req.json() as { business_id: string; query: string }
    if (!business_id || !query) {
      return NextResponse.json({ error: 'business_id and query required' }, { status: 400 })
    }

    const { data: config } = await supabaseAdmin
      .from('instore_kiosk_configs')
      .select('recipe_suggestions, enabled')
      .eq('business_id', business_id)
      .maybeSingle()

    if (config && (config.enabled === false || config.recipe_suggestions === false)) {
      return NextResponse.json({ error: 'Recipe suggestions disabled' }, { status: 403 })
    }

    const { data: products } = await supabaseAdmin.from('pos_products')
      .select('id, name, price, stock_quantity, track_stock')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .limit(200)

    type Prod = { id: string; name: string; price: number | null; stock_quantity: number | null; track_stock: boolean | null }
    const inStock = (products ?? [] as Prod[]).filter((p: Prod) => p.track_stock === false || Number(p.stock_quantity ?? 0) > 0)

    const catalogue = inStock.map((p: Prod) => p.name).slice(0, 60).join(', ')

    const prompt = `A customer in an Australian shop asked: "${query}".
Suggest ONE simple recipe idea (real, common, Australian-friendly) with 3-5 key ingredients.
Then look at this shop's in-stock items: ${catalogue}.
Return ONLY valid JSON, no markdown:
{
  "recipe_name": "string",
  "ingredients": ["string", "string", "string"],
  "matched_ingredient_names": ["names from the shop catalogue above that match recipe ingredients"]
}`

    const response = await trackAICall(
      { route: 'public/instore/recipe', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'instore-recipe' },
      () => anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      })
    )

    const text = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()
    const parsed = parseLLMJsonOr<{ recipe_name?: string; ingredients?: string[]; matched_ingredient_names?: string[] }>(text, {}, 'public/instore/recipe')

    if (!parsed.recipe_name) {
      return NextResponse.json({ error: 'Could not generate recipe' }, { status: 502 })
    }

    const matchedProducts = (parsed.matched_ingredient_names ?? [])
      .map((n: string) => inStock.find((p: Prod) => p.name.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(p.name.toLowerCase())))
      .filter((p: Prod | undefined): p is Prod => Boolean(p))
      .slice(0, 4)
      .map((p: Prod) => ({ id: p.id, name: p.name, price: p.price != null ? Number(p.price) : null }))

    const matchedNames = matchedProducts.map(m => m.name)
    const oneLiner = matchedNames.length > 0
      ? `And you can grab the ${matchedNames.slice(0, 2).join(' and the ')} here.`
      : `We don't have all the ingredients in stock today — but the recipe still works at home!`

    const card: RecipeCard = {
      recipe_name: parsed.recipe_name ?? 'Recipe idea',
      ingredients: parsed.ingredients ?? [],
      one_liner: oneLiner,
      matched_products: matchedProducts,
    }

    await supabaseAdmin.from('instore_demand_signals').insert({
      business_id,
      query_text: query.slice(0, 500),
      product_asked: parsed.recipe_name ?? null,
      in_stock: matchedProducts.length > 0,
      matched_product_id: matchedProducts[0]?.id ?? null,
      signal_type: 'recipe',
    })

    return NextResponse.json({ recipe: card })
  } catch (err) {
    console.error('[instore/recipe] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
