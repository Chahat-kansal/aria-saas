export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { waitUntil } from '@vercel/functions'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { importId, existingRecipeId, businessId } = body
  if (!importId || !existingRecipeId || !businessId) {
    return NextResponse.json({ error: 'importId, existingRecipeId, and businessId required' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: imported } = await supabaseAdmin.from('recipe_imports')
    .select('extracted_title, extracted_ingredients, extracted_steps')
    .eq('id', importId).eq('business_id', businessId).single()
  if (!imported) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  const { data: existing } = await supabaseAdmin.from('recipes')
    .select('name, description, notes, recipe_ingredients(ingredient_name, quantity, unit)')
    .eq('id', existingRecipeId).eq('business_id', businessId).single()
  if (!existing) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })

  const importedText = `Title: ${imported.extracted_title}\nIngredients: ${JSON.stringify(imported.extracted_ingredients)}\nSteps: ${JSON.stringify(imported.extracted_steps)}`
  const existingText = `Name: ${existing.name}\nNotes: ${existing.notes ?? 'none'}\nIngredients: ${JSON.stringify((existing as Record<string, unknown>).recipe_ingredients ?? [])}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  let suggestions = ''
  let inputTokens = 0, outputTokens = 0, aiSuccess = false

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 600,
      temperature: 0.3,
      system: 'You are a culinary expert. Compare two recipes and give 3-5 specific, actionable improvement suggestions. Be concrete — mention exact ingredients, quantities, or steps that differ. Keep it practical for a café owner.',
      messages: [{ role: 'user', content: `IMPORTED RECIPE:\n${importedText}\n\nEXISTING RECIPE:\n${existingText}\n\nWhat specific improvements could the existing recipe adopt from the imported one?` }],
    })
    suggestions = res.content
      .filter((b: { type: string; text?: string }) => b.type === 'text')
      .map((b: { type: string; text?: string }) => b.text ?? '')
      .join('').trim()
    inputTokens = res.usage.input_tokens
    outputTokens = res.usage.output_tokens
    aiSuccess = true
  } catch (e) { console.error('[recipes/compare] AI failed:', (e as Error).message) }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: businessId, agent_key: 'recipe_compare', provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929', role: 'compare',
        input_tokens: inputTokens, output_tokens: outputTokens, success: aiSuccess,
      })
    } catch { /* non-fatal */ }
  })())

  return NextResponse.json({ suggestions })
}

export const POST = withErrorCapture('recipes/compare', _POST)
