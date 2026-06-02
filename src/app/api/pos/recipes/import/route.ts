export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'
// pdf-parse loaded dynamically to avoid serverless bundle issues
async function parsePdf(buf: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const result = await pdfParse(buf)
    return result.text ?? ''
  } catch {
    return '' // graceful fallback — AI will get empty text and return parse error
  }
}

const MODEL = 'claude-haiku-4-5-20251001'

interface ParsedIngredient {
  name: string
  quantity: number
  unit: string
  cost_per_unit: number | null
}

interface ParsedRecipe {
  name: string
  yield_qty: number | null
  yield_unit: string | null
  notes: string | null
  total_cost: number | null
  ingredients: ParsedIngredient[]
}

// ── CSV parser ─────────────────────────────────────────────────────────────
// Expected columns: name, ingredients (semicolon-sep), quantities (semicolon-sep), units (semicolon-sep), yield_qty, yield_unit, cost
function parseCSV(text: string): ParsedRecipe[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
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

    results.push({
      name,
      yield_qty: parseFloat(cols[idx('yield_qty')] ?? cols[idx('yield')] ?? '') || null,
      yield_unit: cols[idx('yield_unit')]?.trim() || null,
      notes: null,
      total_cost: parseFloat(cols[idx('cost')] ?? '') || null,
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

// ── AI extraction (PDF text or raw prompt) ─────────────────────────────────
async function aiParseText(text: string, businessId: string): Promise<ParsedRecipe[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `Extract all recipes from the following text. Return a JSON array of recipe objects. Each object must have:
{
  "name": string,
  "yield_qty": number | null,
  "yield_unit": string | null,
  "notes": string | null,
  "total_cost": number | null,
  "ingredients": [{ "name": string, "quantity": number, "unit": string, "cost_per_unit": number | null }]
}

Text:
${text.slice(0, 8000)}

Return ONLY the JSON array, no other text.`

  const msg = await trackAICall(
    { route: 'pos/recipes/import', model: MODEL, businessId, purpose: 'recipe_text_parse' },
    () => anthropic.messages.create({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
  )
  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '[]'
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(json) as ParsedRecipe[]
}

// ── AI vision (image) ──────────────────────────────────────────────────────
async function aiParseImage(base64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', businessId: string): Promise<ParsedRecipe[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `Look at this recipe image. Extract all recipes you can see. Return a JSON array:
[{ "name": string, "yield_qty": number|null, "yield_unit": string|null, "notes": string|null, "total_cost": number|null, "ingredients": [{ "name": string, "quantity": number, "unit": string, "cost_per_unit": number|null }] }]
Return ONLY the JSON array.`

  const msg = await trackAICall(
    { route: 'pos/recipes/import', model: MODEL, businessId, purpose: 'recipe_vision_parse' },
    () => anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  )
  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '[]'
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(json) as ParsedRecipe[]
}

// ── Product matcher ────────────────────────────────────────────────────────
async function matchProduct(name: string, businessId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('pos_products')
    .select('id, name')
    .eq('business_id', businessId)
    .ilike('name', `%${name.replace(/'/g, "''")}%`)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// ── Insert parsed recipes ──────────────────────────────────────────────────
async function insertRecipes(
  businessId: string,
  parsed: ParsedRecipe[],
  source: string,
): Promise<{ imported: number; failed: number; recipes: unknown[] }> {
  let imported = 0; let failed = 0
  const insertedRecipes: unknown[] = []

  for (const r of parsed) {
    if (!r.name?.trim()) { failed++; continue }
    try {
      const totalCost = r.total_cost ?? (r.ingredients.reduce((s, i) => s + (i.quantity * (i.cost_per_unit ?? 0)), 0) || null)

      const { data: recipe, error: recErr } = await supabaseAdmin.from('recipes').insert({
        business_id: businessId,
        name: r.name.trim(),
        yield_qty: r.yield_qty ?? null,
        yield_unit: r.yield_unit ?? null,
        notes: r.notes ?? null,
        total_cost: totalCost,
        source,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('id').single()

      if (recErr || !recipe) { failed++; continue }

      if (r.ingredients.length > 0) {
        const ingRows = await Promise.all(
          r.ingredients.map(async (ing) => {
            const productId = await matchProduct(ing.name, businessId)
            let costPerUnit = ing.cost_per_unit ?? null
            if (!costPerUnit && productId) {
              const { data: prod } = await supabaseAdmin.from('pos_products').select('price').eq('id', productId).maybeSingle()
              costPerUnit = prod?.price != null ? Number(prod.price) : null
            }
            return {
              recipe_id: recipe.id,
              business_id: businessId,
              product_id: productId,
              ingredient_name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              cost_per_unit: costPerUnit,
              cost_cents: costPerUnit != null ? Math.round(costPerUnit * 100) : null,
              created_at: new Date().toISOString(),
            }
          })
        )
        await supabaseAdmin.from('recipe_ingredients').insert(ingRows)

        if (!r.total_cost) {
          const computed = ingRows.reduce((s, i) => s + (i.quantity * (i.cost_per_unit ?? 0)), 0)
          if (computed > 0) {
            await supabaseAdmin.from('recipes').update({ total_cost: computed }).eq('id', recipe.id)
          }
        }
      }

      insertedRecipes.push({ id: recipe.id, name: r.name })
      imported++
    } catch { failed++ }
  }

  return { imported, failed, recipes: insertedRecipes }
}

// ── Handler ────────────────────────────────────────────────────────────────
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
      const text = await file.text()
      parsed = parseCSV(text)
    } else if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const buf = Buffer.from(await file.arrayBuffer())
      const data = await parsePdf(buf)
      parsed = await aiParseText(data, businessId)
    } else if (mimeType.startsWith('image/')) {
      const buf = Buffer.from(await file.arrayBuffer())
      const base64 = buf.toString('base64')
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
      type AllowedMime = typeof allowed[number]
      const mt: AllowedMime = (allowed as readonly string[]).includes(mimeType) ? mimeType as AllowedMime : 'image/jpeg'
      parsed = await aiParseImage(base64, mt, businessId)
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use CSV, PDF, or image.' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: `Parse error: ${(e as Error).message ?? 'unknown'}` }, { status: 500 })
  }

  if (parsed.length === 0) return NextResponse.json({ error: 'No recipes found in file', imported: 0, failed: 0, recipes: [] })

  const result = await insertRecipes(businessId, parsed, fileName.endsWith('.csv') ? 'csv' : mimeType.startsWith('image/') ? 'image' : 'pdf')

  await supabaseAdmin.from('recipe_imports').insert({
    business_id: businessId,
    file_name: fileName,
    rows_imported: result.imported,
    rows_failed: result.failed,
    imported_at: new Date().toISOString(),
  })

  return NextResponse.json({ imported: result.imported, failed: result.failed, recipes: result.recipes })
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
    .select('id, file_name, rows_imported, rows_failed, imported_at')
    .eq('business_id', businessId)
    .order('imported_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ imports: imports ?? [] })
}

export const POST = withErrorCapture('pos/recipes/import', _POST)
export const GET = withErrorCapture('pos/recipes/import', _GET)
