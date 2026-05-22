export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// Enhance prompt with business context for better results
function buildEnhancedPrompt(prompt: string, style: string, format: string, biz: { name?: string; industry?: string } | null): string {
  const styleMap: Record<string, string> = {
    photorealistic: 'photorealistic, professional photography, high quality, 8K',
    illustration: 'digital illustration, vibrant colors, professional graphic design',
    minimalist: 'minimalist design, clean, modern, white space, simple',
    bold: 'bold graphic design, high contrast, striking colors, poster style',
    vintage: 'vintage style, retro aesthetic, warm tones, nostalgic',
    neon: 'neon glow, dark background, vibrant neon colors, night aesthetic',
  }
  const formatHint = format === 'square' ? 'square format' : format === 'portrait' ? 'portrait orientation, tall format' : 'landscape, wide format, banner'
  const industryHint = biz?.industry ? `for a ${biz.industry} business` : 'for a small business'
  const styleStr = styleMap[style] ?? styleMap.photorealistic
  return `${prompt}, ${industryHint}, ${styleStr}, ${formatHint}, professional marketing image, no text overlay`
}

async function tryStabilityAI(prompt: string, format: string): Promise<{ url: string; provider: string } | null> {
  const key = process.env.STABILITY_AI_KEY
  if (!key) return null
  const [w, h] = format === 'portrait' ? [768, 1344] : format === 'landscape' ? [1344, 768] : [1024, 1024]
  try {
    const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
      body: (() => {
        const fd = new FormData()
        fd.append('prompt', prompt)
        fd.append('model', 'sd3.5-large-turbo')
        fd.append('output_format', 'jpeg')
        fd.append('width', String(w))
        fd.append('height', String(h))
        return fd
      })(),
    })
    if (!res.ok) return null
    const d = await res.json() as { image?: string }
    if (!d.image) return null
    // Upload to Vercel Blob
    const imgBuf = Buffer.from(d.image, 'base64')
    const { put } = await import('@vercel/blob')
    const blob = await put('aria-studio/' + Date.now() + '.jpg', imgBuf, { access: 'public', contentType: 'image/jpeg' })
    return { url: blob.url, provider: 'Stability AI SD3.5' }
  } catch { return null }
}

async function tryDALLE3(prompt: string, format: string): Promise<{ url: string; provider: string } | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const sizeMap: Record<string, string> = { square: '1024x1024', portrait: '1024x1792', landscape: '1792x1024' }
  const size = sizeMap[format] ?? '1024x1024'
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'dall-e-3', prompt: prompt.slice(0, 4000), n: 1, size, quality: 'hd', response_format: 'url' }),
    })
    if (!res.ok) return null
    const d = await res.json() as { data?: Array<{ url?: string }> }
    const url = d.data?.[0]?.url
    if (!url) return null
    return { url, provider: 'DALL·3' }
  } catch { return null }
}

async function tryReplicate(prompt: string, format: string): Promise<{ url: string; provider: string } | null> {
  const key = process.env.REPLICATE_API_KEY
  if (!key) return null
  const [w, h] = format === 'portrait' ? [768, 1344] : format === 'landscape' ? [1344, 768] : [1024, 1024]
  try {
    // FLUX Schnell — fast, high quality, free tier available
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'wait' },
      body: JSON.stringify({ input: { prompt: prompt.slice(0, 2000), width: w, height: h, num_outputs: 1, output_format: 'jpg', go_fast: true } }),
    })
    if (!res.ok) return null
    const d = await res.json() as { output?: string[] | string; status?: string }
    const url = Array.isArray(d.output) ? d.output[0] : (typeof d.output === 'string' ? d.output : null)
    if (!url) return null
    return { url, provider: 'FLUX Schnell' }
  } catch { return null }
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ assets: [] })
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '40'), 100)
  const folder = searchParams.get('folder') ?? null
  let q = supabase.from('aria_studio_assets').select('*').eq('business_id', bid).order('created_at', { ascending: false }).limit(limit)
  if (folder) q = q.eq('folder', folder)
  const { data } = await q
  return NextResponse.json({ assets: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as {
    action?: string
    prompt?: string; style?: string; format?: string; folder?: string; tags?: string[]
    asset_id?: string; base64?: string; file_name?: string; file_type?: string
  }

  // ── Refine prompt with Aria ──────────────────────────────
  if (body.action === 'refine_prompt') {
    if (!body.prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })
    const { data: biz } = await supabaseAdmin.from('businesses').select('name,industry').eq('id', bid).maybeSingle()
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      system: 'You are Aria, an expert at writing image generation prompts for small business marketing. Rewrite the user prompt to be detailed and effective for AI image generation. Keep it under 150 words. Return ONLY the improved prompt, no explanation.',
      messages: [{ role: 'user', content: 'Business: ' + (biz?.name ?? '') + ' (' + (biz?.industry ?? '') + '). Original prompt: ' + body.prompt }],
    })
    const refined = msg.content[0].type === 'text' ? msg.content[0].text.trim() : body.prompt
    return NextResponse.json({ refined_prompt: refined })
  }

  // ── Generate image ────────────────────────────────────────
  if (!body.prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  const { data: biz } = await supabaseAdmin.from('businesses').select('name,industry').eq('id', bid).maybeSingle()
  const style = body.style ?? 'photorealistic'
  const format = body.format ?? 'square'
  const enhancedPrompt = buildEnhancedPrompt(body.prompt, style, format, biz)

  // Try providers in priority order: Stability → DALL-E → Replicate
  let result: { url: string; provider: string } | null = null
  result = await tryStabilityAI(enhancedPrompt, format)
  if (!result) result = await tryDALLE3(enhancedPrompt, format)
  if (!result) result = await tryReplicate(enhancedPrompt, format)
  if (!result) return NextResponse.json({ error: 'No image generation provider configured. Add STABILITY_AI_KEY, OPENAI_API_KEY, or REPLICATE_API_KEY to your environment variables.' }, { status: 503 })

  // Save to DB
  const { data: asset, error } = await supabaseAdmin.from('aria_studio_assets').insert({
    business_id: bid,
    prompt: body.prompt, enhanced_prompt: enhancedPrompt,
    style, format, provider: result.provider,
    image_url: result.url, folder: body.folder ?? 'generated',
    tags: body.tags ?? [], status: 'ready',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset, url: result.url, provider: result.provider, ok: true })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { id: string; folder?: string; tags?: string[]; name?: string; favourite?: boolean }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (body.folder !== undefined) updates.folder = body.folder
  if (body.tags !== undefined) updates.tags = body.tags
  if (body.name !== undefined) updates.name = body.name
  if (body.favourite !== undefined) updates.favourite = body.favourite

  const { data, error } = await supabaseAdmin.from('aria_studio_assets').update(updates).eq('id', body.id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset: data, ok: true })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('aria_studio_assets').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/studio', _GET)
export const POST = withErrorCapture('aria/studio', _POST)
export const PATCH = withErrorCapture('aria/studio', _PATCH)
export const DELETE = withErrorCapture('aria/studio', _DELETE)
