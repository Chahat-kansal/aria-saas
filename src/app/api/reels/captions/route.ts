export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic()

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { business_id, session_id, style, prompt: userPrompt } = body as {
    business_id?: string
    session_id?: string
    style?: string
    prompt?: string
  }

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id, name, category')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Pull light POS context to make captions relevant
  const [{ data: products }, { data: reviews }] = await Promise.all([
    supabaseAdmin.from('pos_products').select('name, price')
      .eq('business_id', business_id).eq('active', true).limit(8),
    supabaseAdmin.from('google_reviews').select('rating, text')
      .eq('business_id', business_id).order('created_at', { ascending: false }).limit(4),
  ])

  const bizCtx = 'Business: ' + biz.name + ' (' + (biz.category || 'retail') + ')\n' +
    (products?.length ? 'Products: ' + products.slice(0, 5).map((p: any) => p.name).join(', ') + '\n' : '') +
    (reviews?.length ? 'Recent review snippets: ' + reviews.slice(0, 3).map((r: any) => (r.text || '').slice(0, 60)).join('; ') + '\n' : '')

  const systemPrompt = 'You are a social media expert for small Australian businesses. ' +
    'Write captions that sound authentic, use Australian English, and drive real engagement. ' +
    'Keep on-video text very short — max 8 words each. ' +
    'Always respond with valid JSON matching the exact schema requested.'

  const userMessage = 'Create caption content for a ' + (style || 'promotional') + ' vertical video reel' +
    (userPrompt ? ' about: ' + userPrompt : '') + '.\n\n' +
    bizCtx + '\n' +
    'Respond ONLY with valid JSON in this exact shape:\n' +
    '{\n' +
    '  "onVideo": ["short text 1", "short text 2", "short text 3"],\n' +
    '  "social": [\n' +
    '    { "caption": "...", "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"] },\n' +
    '    { "caption": "...", "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"] },\n' +
    '    { "caption": "...", "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"] }\n' +
    '  ]\n' +
    '}'

  const t0 = Date.now()

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const latencyMs = Date.now() - t0
    const rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''

    // Log to aria_ai_calls
    const costUsdCents = Math.round(
      (msg.usage.input_tokens * 0.00000025 + msg.usage.output_tokens * 0.00000125) * 100,
    )
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id,
        agent_key: 'reels_captions',
        provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001',
        role: 'social',
        input_tokens: msg.usage.input_tokens,
        output_tokens: msg.usage.output_tokens,
        latency_ms: latencyMs,
        cost_usd_cents: costUsdCents,
        success: true,
        request_summary: 'Reel caption generation — style: ' + (style || 'promo'),
        response_summary: '3 on-video texts + 3 social captions generated',
      })
    } catch { /* non-fatal */ }

    // Extract JSON from response (model may wrap in markdown)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Model did not return valid JSON')
    const result = JSON.parse(jsonMatch[0])

    return NextResponse.json(result)
  } catch (e: any) {
    // Log failure
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id,
        agent_key: 'reels_captions',
        provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001',
        role: 'social',
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - t0,
        cost_usd_cents: 0,
        success: false,
        error_message: e.message,
        request_summary: 'Reel caption generation failed',
        response_summary: null,
      })
    } catch { /* non-fatal */ }

    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export const POST = withErrorCapture('reels/captions', _POST)
