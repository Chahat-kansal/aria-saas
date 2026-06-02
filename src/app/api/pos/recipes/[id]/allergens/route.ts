export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'

// Rule-based allergen detection (fast, no AI needed for obvious cases)
const ALLERGEN_RULES: Array<{ allergen: string; keywords: string[] }> = [
  { allergen: 'Gluten', keywords: ['flour', 'wheat', 'bread', 'pasta', 'rye', 'barley', 'oat', 'semolina', 'spelt', 'durum', 'croissant', 'bagel', 'soy sauce', 'miso', 'beer', 'malt'] },
  { allergen: 'Dairy', keywords: ['milk', 'cream', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cheddar', 'mozzarella', 'parmesan', 'brie', 'ricotta', 'whey', 'lactose', 'ghee', 'sour cream', 'ice cream'] },
  { allergen: 'Eggs', keywords: ['egg', 'eggs', 'mayonnaise', 'mayo', 'meringue', 'albumen'] },
  { allergen: 'Nuts', keywords: ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'macadamia', 'hazelnut', 'brazil nut', 'pine nut', 'chestnut', 'mixed nuts'] },
  { allergen: 'Peanuts', keywords: ['peanut', 'peanut butter', 'groundnut'] },
  { allergen: 'Sesame', keywords: ['sesame', 'tahini', 'sesame oil', 'sesame seed'] },
  { allergen: 'Soy', keywords: ['soy', 'soya', 'tofu', 'tempeh', 'edamame', 'miso', 'soy sauce', 'tamari'] },
  { allergen: 'Fish', keywords: ['fish', 'salmon', 'tuna', 'cod', 'sardine', 'anchovy', 'anchovies', 'herring', 'bass', 'trout', 'snapper', 'fish sauce', 'worcestershire'] },
  { allergen: 'Shellfish', keywords: ['prawn', 'shrimp', 'crab', 'lobster', 'crayfish', 'oyster', 'mussel', 'scallop', 'clam', 'squid', 'calamari', 'octopus'] },
  { allergen: 'Lupin', keywords: ['lupin', 'lupine'] },
  { allergen: 'Sulphites', keywords: ['sulphite', 'sulfite', 'dried fruit', 'wine vinegar', 'white wine', 'red wine'] },
]

function detectAllergensRuleBased(ingredientNames: string[]): string[] {
  const detected = new Set<string>()
  const combined = ingredientNames.join(' ').toLowerCase()
  for (const rule of ALLERGEN_RULES) {
    for (const kw of rule.keywords) {
      if (combined.includes(kw)) { detected.add(rule.allergen); break }
    }
  }
  return [...detected]
}

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: recipe } = await supabase.from('recipes').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', recipe.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ings } = await supabaseAdmin
    .from('recipe_ingredients')
    .select('ingredient_name')
    .eq('recipe_id', params.id)

  const ingredientNames = (ings ?? []).map(i => i.ingredient_name as string).filter(Boolean)
  if (ingredientNames.length === 0) return NextResponse.json({ allergens: [] })

  // Start with rule-based detection
  const ruleDetected = detectAllergensRuleBased(ingredientNames)

  // Supplement with AI for edge cases
  let aiDetected: string[] = []
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const prompt = 'Identify all allergens in these recipe ingredients. Return ONLY a JSON array of allergen names from this list: ["Gluten","Dairy","Eggs","Nuts","Peanuts","Sesame","Soy","Fish","Shellfish","Lupin","Sulphites"]\n\nIngredients: ' + ingredientNames.join(', ') + '\n\nReturn ONLY the JSON array.'
      const msg = await trackAICall(
        { route: 'pos/recipes/[id]/allergens', model: MODEL, businessId: recipe.business_id, purpose: 'allergen_detect' },
        () => anthropic.messages.create({ model: MODEL, max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
      )
      const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '[]'
      const parsed = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''))
      if (Array.isArray(parsed)) aiDetected = parsed.filter((x: unknown) => typeof x === 'string')
    } catch { /* use rule-based only */ }
  }

  // Merge both detection methods
  const merged = [...new Set([...ruleDetected, ...aiDetected])]

  // Save to recipe
  await supabaseAdmin.from('recipes').update({ allergens: merged, updated_at: new Date().toISOString() }).eq('id', params.id)

  return NextResponse.json({ allergens: merged, detected_from: ingredientNames.length + ' ingredients' })
}

// Also support GET to re-detect without saving
async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: recipe } = await supabase.from('recipes').select('id, business_id, allergens').eq('id', params.id).maybeSingle()
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', recipe.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ings } = await supabaseAdmin.from('recipe_ingredients').select('ingredient_name').eq('recipe_id', params.id)
  const ingredientNames = (ings ?? []).map(i => i.ingredient_name as string).filter(Boolean)
  const detected = detectAllergensRuleBased(ingredientNames)

  return NextResponse.json({ allergens: recipe.allergens ?? detected, rule_detected: detected })
}

export const POST = withErrorCapture('pos/recipes/[id]/allergens', _POST)
export const GET = withErrorCapture('pos/recipes/[id]/allergens', _GET)

// Export helper for use in other routes
export { detectAllergensRuleBased }
