export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// Aria caption suggestions for a reel. Returns both short on-video caption text
// and ready-to-paste social post captions with hashtags.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, prompt: reelPrompt, style } = await req.json().catch(() => ({}))
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('id, name, industry').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Light context: top products to make captions specific
  let topProducts: string[] = []
  try {
    const { data } = await supabaseAdmin.from('pos_products')
      .select('name').eq('business_id', business_id).eq('is_active', true).limit(8)
    topProducts = (data ?? []).map(p => p.name).filter(Boolean)
  } catch { /* non-fatal */ }

  const prompt = `You are Aria, the AI marketing partner for "${biz.name}", a ${biz.industry ?? 'small'} business in Australia.
Write Instagram/TikTok captions for a short reel.
Reel concept: ${reelPrompt || 'a warm, authentic promotional reel for the business'}
Reel style: ${style || 'lifestyle'}
${topProducts.length ? 'Popular products: ' + topProducts.join(', ') : ''}

Return ONLY valid JSON, no markdown, in this exact shape:
{
  "onVideo": ["3 SHORT punchy on-screen text overlays, max 5 words each — these get burned onto the video"],
  "social": [
    { "caption": "Full social post caption, warm and authentic, 1-2 sentences with 1-2 emojis", "hashtags": ["tag1","tag2","tag3","tag4"] },
    { "caption": "A second, different-toned option", "hashtags": ["tag1","tag2","tag3"] },
    { "caption": "A third option with a clear call-to-action", "hashtags": ["tag1","tag2","tag3"] }
  ]
}
Australian tone. No generic filler. Make captions specific to this business where possible.`

  let parsed: any = null
  let raw = ''
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })
    raw = (response.content[0] as { type: string; text: string }).text ?? ''
    const clean = raw.replace(/\`\`\`json|\`\`\`/g, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: 'Failed to generate captions', raw }, { status: 500 })
  }

  // Telemetry (best-effort, never blocks)
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id, feature: 'reel_captions', model: 'claude-haiku-4-5-20251001',
      success: true,
    })
  } catch { /* ignore */ }

  return NextResponse.json({
    onVideo: parsed.onVideo ?? [],
    social: parsed.social ?? [],
  })
}
