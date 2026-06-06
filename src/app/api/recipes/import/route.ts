export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { waitUntil } from '@vercel/functions'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const NO_RECIPE = {
  error: 'no_recipe_found' as const,
  message: "Couldn't read a recipe from this link — try a post that has written ingredients and steps.",
}

async function extractPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AriaBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()
  const og = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] ?? ''
  const meta = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] ?? ''
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)
  return [og, meta, body].filter(Boolean).join('\n\n').trim()
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data } = await supabaseAdmin.from('recipe_imports')
    .select('id, source_url, source_type, extracted_title, status, created_at')
    .eq('business_id', businessId).order('created_at', { ascending: false }).limit(20)
  return NextResponse.json({ imports: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { source_url, businessId } = body
  if (!source_url || !businessId) return NextResponse.json({ error: 'source_url and businessId required' }, { status: 400 })
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let pageText = ''
  try { pageText = await extractPageText(source_url as string) }
  catch (e) { console.error('[recipes/import] fetch failed:', (e as Error).message) }
  if (pageText.length < 20) return NextResponse.json(NO_RECIPE)

  const sourceType = (source_url as string).includes('instagram.com') ? 'instagram' : 'web'
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

  type Ingredient = { item: string; quantity: string; unit: string }
  type Extracted = { title: string; ingredients: Ingredient[]; steps: string[] }
  let extracted: Extracted | null = null
  let inputTokens = 0, outputTokens = 0, aiSuccess = false

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      temperature: 0,
      system: 'You are a recipe extraction assistant. Return ONLY valid JSON, no preamble, no code fences.',
      messages: [{ role: 'user', content: `Extract the recipe. Return ONLY:\n{"title":"...","ingredients":[{"item":"...","quantity":"...","unit":"..."}],"steps":["..."]}\nIf no recipe found: {"title":"","ingredients":[],"steps":[]}\n\nText:\n${pageText.slice(0, 2500)}` }],
    })
    const text = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('')
    inputTokens = res.usage.input_tokens
    outputTokens = res.usage.output_tokens
    const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}')
    if (s >= 0 && e > s) {
      const parsed = JSON.parse(clean.slice(s, e + 1)) as Extracted
      if (parsed.title && Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0) {
        extracted = parsed; aiSuccess = true
      }
    }
  } catch (e) { console.error('[recipes/import] AI failed:', (e as Error).message) }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: businessId, agent_key: 'recipe_import', provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929', role: 'import',
        input_tokens: inputTokens, output_tokens: outputTokens, success: aiSuccess,
      })
    } catch (e) { console.error('[non-fatal]', e) }
  })())

  if (!extracted) {
    await supabaseAdmin.from('recipe_imports').insert({
      business_id: businessId, user_id: user.id, source_url, source_type: sourceType, status: 'failed',
    })
    return NextResponse.json(NO_RECIPE)
  }

  const { data: importRow } = await supabaseAdmin.from('recipe_imports').insert({
    business_id: businessId, user_id: user.id, source_url, source_type: sourceType,
    extracted_title: extracted.title, extracted_ingredients: extracted.ingredients,
    extracted_steps: extracted.steps, status: 'extracted',
  }).select('id').single()

  return NextResponse.json({ importId: importRow?.id ?? null, recipe: extracted })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { importId, status, linkedProductId } = body
  if (!importId) return NextResponse.json({ error: 'importId required' }, { status: 400 })
  const { data: row } = await supabaseAdmin.from('recipe_imports').select('id, business_id').eq('id', importId).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', row.business_id as string).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status) update.status = status
  if (linkedProductId) update.linked_product_id = linkedProductId
  await supabaseAdmin.from('recipe_imports').update(update).eq('id', importId)
  return NextResponse.json({ ok: true })
}

export const GET   = withErrorCapture('recipes/import', _GET)
export const POST  = withErrorCapture('recipes/import', _POST)
export const PATCH = withErrorCapture('recipes/import', _PATCH)
