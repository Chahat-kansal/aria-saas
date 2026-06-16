export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'

interface ParsedIngredient {
  name: string
  quantity: number
  unit: string
  cost_per_unit: number | null
  allergens?: string[] | null
}

interface ParsedRecipe {
  name: string
  yield_qty: number | null
  yield_unit: string | null
  notes: string | null
  total_cost: number | null
  category: string | null
  ingredients: ParsedIngredient[]
  allergens?: string[] | null
}

// Common AU allergen vocabulary — keep AI output normalised to these where possible.
const ALLERGEN_VOCAB = ['gluten', 'wheat', 'dairy', 'milk', 'eggs', 'fish', 'shellfish', 'crustacean', 'tree nuts', 'nuts', 'peanuts', 'soy', 'soya', 'sesame', 'lupin', 'sulphites', 'mustard', 'celery']
function normaliseAllergens(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out = new Set<string>()
  for (const a of input) {
    const v = String(a ?? '').trim().toLowerCase()
    if (v) out.add(v)
  }
  return [...out]
}

// ── CSV parser ──────────────────────────────────────────────────────────────
// Columns: name, ingredients (;-sep), quantities (;-sep), units (;-sep), yield_qty, yield_unit, cost_per_serving, category
function parseCSV(text: string): ParsedRecipe[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
  const idx = (name: string) => header.indexOf(name)

  const results: ParsedRecipe[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    const name = cols[idx('name')]?.trim()
    if (!name) continue

    const ingredientNames = (cols[idx('ingredients')] ?? '').split(';').map(s => s.trim()).filter(Boolean)
    const quantities = (cols[idx('quantities')] ?? '').split(';').map(s => parseFloat(s.trim()) || 1)
    const units = (cols[idx('units')] ?? '').split(';').map(s => s.trim() || 'each')

    const ingredients: ParsedIngredient[] = ingredientNames.map((n, j) => ({
      name: n,
      quantity: quantities[j] ?? 1,
      unit: units[j] ?? 'each',
      cost_per_unit: null,
    }))

    const yieldQty = parseFloat(cols[idx('yield_qty')] ?? cols[idx('yield')] ?? '') || null
    // cost_per_serving from CSV is already per-serving
    const costPerServing = parseFloat(cols[idx('cost_per_serving')] ?? cols[idx('cost')] ?? '') || null
    const totalCost = costPerServing != null && yieldQty != null ? costPerServing * yieldQty : costPerServing

    const allergens = (cols[idx('allergens')] ?? '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)

    results.push({
      name,
      yield_qty: yieldQty,
      yield_unit: cols[idx('yield_unit')]?.trim() || null,
      notes: null,
      total_cost: totalCost,
      category: cols[idx('category')]?.trim() || null,
      allergens: allergens.length ? allergens : null,
      ingredients,
    })
  }
  return results
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

// ── PDF extraction via Claude native PDF vision ─────────────────────────────
async function parsePdf(buf: Buffer): Promise<string> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
          { type: 'text', text: 'Extract all text from this PDF document. Return the raw text only, no commentary.' },
        ],
      }],
    })
    const textBlock = response.content.find(b => b.type === 'text')
    return textBlock && 'text' in textBlock ? textBlock.text : ''
  } catch { return '' }
}

// ── AI text extraction (PDF text or plain text) ──────────────────────────────
async function aiParseText(text: string, businessId: string): Promise<ParsedRecipe[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prompt = `Extract all recipes from the following text. Return a JSON array of recipe objects with exact schema:
[{
  "name": string,
  "yield_qty": number|null,
  "yield_unit": string|null,
  "notes": string|null,
  "total_cost": number|null,
  "category": string|null,
  "allergens": string[],
  "ingredients": [{ "name": string, "quantity": number, "unit": string, "cost_per_unit": number|null, "allergens": string[] }]
}]
For each ingredient, list any food allergens it contains using these lowercase names where they apply: ${ALLERGEN_VOCAB.join(', ')}. The recipe-level "allergens" is the union of all its ingredients' allergens. Use [] when none apply — never invent an allergen that is not implied by the ingredient.
Text:
${text.slice(0, 8000)}
Return ONLY the JSON array, no other text.`

  const msg = await trackAICall(
    { route: 'pos/recipes/import', model: MODEL, businessId, purpose: 'recipe_text_parse' },
    () => anthropic.messages.create({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
  )
  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '[]'
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  try { return JSON.parse(json) as ParsedRecipe[] } catch { return [] }
}

// ── AI vision (image) ────────────────────────────────────────────────────────
async function aiParseImage(base64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', businessId: string): Promise<ParsedRecipe[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prompt = `Look at this recipe image. Extract all recipes you can see. Return a JSON array:
[{ "name": string, "yield_qty": number|null, "yield_unit": string|null, "notes": string|null, "total_cost": number|null, "category": string|null, "allergens": string[], "ingredients": [{ "name": string, "quantity": number, "unit": string, "cost_per_unit": number|null, "allergens": string[] }] }]
For each ingredient list any food allergens it contains using these lowercase names where they apply: ${ALLERGEN_VOCAB.join(', ')}. Recipe-level "allergens" = union of ingredient allergens. Use [] when none apply; never invent one.
Return ONLY the JSON array.`

  const msg = await trackAICall(
    { route: 'pos/recipes/import', model: MODEL, businessId, purpose: 'recipe_vision_parse' },
    () => anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: prompt },
      ]}],
    }),
  )
  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '[]'
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  try { return JSON.parse(json) as ParsedRecipe[] } catch { return [] }
}

// ── Product matcher ──────────────────────────────────────────────────────────
async function matchProduct(name: string, businessId: string): Promise<{ id: string; price: number | null } | null> {
  const { data } = await supabaseAdmin
    .from('pos_products')
    .select('id, price')
    .eq('business_id', businessId)
    .ilike('name', '%' + name.replace(/'/g, "''") + '%')
    .limit(1)
    .maybeSingle()
  return data ? { id: data.id, price: data.price != null ? Number(data.price) : null } : null
}

// ── Insert parsed recipes ────────────────────────────────────────────────────
interface InsertResult {
  imported: number
  failed: number
  skipped: number
  recipes: Array<{ name: string; total_cost: number | null; cost_per_serving: number | null; ingredient_count: number }>
}

async function insertRecipes(businessId: string, parsed: ParsedRecipe[], source: string): Promise<InsertResult> {
  let imported = 0; let failed = 0; let skipped = 0
  const insertedRecipes: InsertResult['recipes'] = []
  // Idempotent within this batch too — don't double-insert if the same name appears twice in one file.
  const seenThisBatch = new Set<string>()

  for (const r of parsed) {
    if (!r.name?.trim()) { failed++; continue }
    const cleanName = r.name.trim()
    const nameKey = cleanName.toLowerCase()

    // Idempotent dedupe by name + business_id (case-insensitive, ignoring soft-deleted recipes).
    if (seenThisBatch.has(nameKey)) { skipped++; continue }
    const { data: existing } = await supabaseAdmin.from('recipes')
      .select('id').eq('business_id', businessId).ilike('name', cleanName).is('deleted_at', null).limit(1).maybeSingle()
    if (existing) { skipped++; seenThisBatch.add(nameKey); continue }
    seenThisBatch.add(nameKey)

    try {
      // recipe-level allergens: explicit if provided, else union of ingredient allergens
      const recipeAllergens = r.allergens && r.allergens.length
        ? normaliseAllergens(r.allergens)
        : normaliseAllergens(r.ingredients.flatMap(i => i.allergens ?? []))

      const { data: recipe, error: recErr } = await supabaseAdmin.from('recipes').insert({
        business_id: businessId,
        name: cleanName,
        yield_qty: r.yield_qty ?? null,
        yield_unit: r.yield_unit ?? null,
        notes: r.notes ?? null,
        total_cost: r.total_cost ?? null,
        category: r.category ?? null,
        allergens: recipeAllergens.length ? recipeAllergens : null,
        source,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('id').single()

      if (recErr || !recipe) { failed++; continue }

      let computedCost = r.total_cost ?? 0

      if (r.ingredients.length > 0) {
        const ingRows = await Promise.all(
          r.ingredients.map(async (ing) => {
            const match = await matchProduct(ing.name, businessId)
            const costPerUnit = ing.cost_per_unit ?? match?.price ?? null
            const ingAllergens = normaliseAllergens(ing.allergens)
            return {
              recipe_id: recipe.id,
              business_id: businessId,
              product_id: match?.id ?? null,
              ingredient_name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              cost_per_unit: costPerUnit,
              cost_cents: costPerUnit != null ? Math.round(costPerUnit * 100) : null,
              allergens: ingAllergens.length ? ingAllergens : null,
              wastage_pct: 0,
              created_at: new Date().toISOString(),
            }
          })
        )
        await supabaseAdmin.from('recipe_ingredients').insert(ingRows)

        if (!r.total_cost) {
          computedCost = ingRows.reduce((s, i) => s + (Number(i.quantity) * (i.cost_per_unit ?? 0)), 0)
        }
      }

      const costPerServing = r.yield_qty && r.yield_qty > 0 ? computedCost / r.yield_qty : computedCost || null

      if (computedCost > 0 || !r.total_cost) {
        const suggestedPrice = computedCost > 0 ? computedCost / 0.35 : null
        await supabaseAdmin.from('recipes').update({
          total_cost: computedCost,
          cost_per_serve: costPerServing,
          suggested_price: suggestedPrice,
          last_cost_updated_at: new Date().toISOString(),
        }).eq('id', recipe.id)
      }

      insertedRecipes.push({
        name: r.name.trim(),
        total_cost: computedCost || null,
        cost_per_serving: costPerServing,
        ingredient_count: r.ingredients.length,
      })
      imported++
    } catch { failed++ }
  }

  return { imported, failed, skipped, recipes: insertedRecipes }
}

// ── Handlers ─────────────────────────────────────────────────────────────────
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Paste path (spec: "owner pastes/uploads"): a JSON body { text, business_id } is AI-parsed directly.
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await req.json().catch(() => ({})) as { text?: string; business_id?: string }
    const pastedText = (body.text ?? '').trim()
    const pasteBid = (body.business_id ?? '').trim()
    if (!pastedText || pastedText.length < 10) return NextResponse.json({ error: 'text required (paste a recipe)' }, { status: 400 })
    if (!pasteBid) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
    const { data: pbiz } = await supabase.from('businesses').select('id').eq('id', pasteBid).eq('user_id', user.id).maybeSingle()
    if (!pbiz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const pasteParsed = await aiParseText(pastedText, pasteBid)
    if (pasteParsed.length === 0) return NextResponse.json({ error: 'No recipes found in pasted text', imported: 0, failed: 0, skipped: 0, recipes: [] })
    const pasteResult = await insertRecipes(pasteBid, pasteParsed, 'paste')
    await supabaseAdmin.from('recipe_imports').insert({
      business_id: pasteBid, file_name: 'pasted text', rows_imported: pasteResult.imported, rows_failed: pasteResult.failed, imported_at: new Date().toISOString(),
    })
    return NextResponse.json({ imported: pasteResult.imported, failed: pasteResult.failed, skipped: pasteResult.skipped, recipes: pasteResult.recipes })
  }

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Multipart form required' }, { status: 400 })

  const file = formData.get('file') as File | null
  const businessId = (formData.get('business_id') as string | null)?.trim()

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const fileName = file.name ?? 'upload'
  const mimeType = file.type ?? ''
  let parsed: ParsedRecipe[] = []

  try {
    if (mimeType === 'text/csv' || fileName.endsWith('.csv')) {
      parsed = parseCSV(await file.text())
    } else if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const text = await parsePdf(Buffer.from(await file.arrayBuffer()))
      parsed = await aiParseText(text, businessId)
    } else if (mimeType.startsWith('image/')) {
      const buf = Buffer.from(await file.arrayBuffer())
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
      type AllowedMime = typeof allowed[number]
      const mt: AllowedMime = (allowed as readonly string[]).includes(mimeType) ? mimeType as AllowedMime : 'image/jpeg'
      parsed = await aiParseImage(buf.toString('base64'), mt, businessId)
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use CSV, PDF, or image.' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: 'Parse error: ' + ((e as Error).message ?? 'unknown') }, { status: 500 })
  }

  if (parsed.length === 0) return NextResponse.json({ error: 'No recipes found in file', imported: 0, failed: 0, recipes: [] })

  const source = fileName.endsWith('.csv') ? 'csv' : mimeType.startsWith('image/') ? 'image' : 'pdf'
  const result = await insertRecipes(businessId, parsed, source)

  await supabaseAdmin.from('recipe_imports').insert({
    business_id: businessId,
    file_name: fileName,
    rows_imported: result.imported,
    rows_failed: result.failed,
    imported_at: new Date().toISOString(),
  })

  return NextResponse.json({ imported: result.imported, failed: result.failed, skipped: result.skipped, recipes: result.recipes })
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = new URL(req.url).searchParams.get('business_id')
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: imports } = await supabaseAdmin
    .from('recipe_imports')
    .select('id, file_name, rows_imported, rows_failed, imported_at, created_at')
    .eq('business_id', businessId)
    .order('imported_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ imports: imports ?? [] })
}

export const POST = withErrorCapture('pos/recipes/import', _POST)
export const GET = withErrorCapture('pos/recipes/import', _GET)
