export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const HF = 'https://api.higgsfield.ai'

function hfAuth() {
  const k = process.env.HIGGSFIELD_API_KEY ?? ''
  return 'Bearer ' + k.replace(/^Bearer\s+/i, '').replace(/^Key\s+/i, '')
}

const STYLE_PROMPTS: Record<string, string> = {
  lifestyle:        'Warm cinematic lifestyle,',
  ugc:              'Authentic UGC creator style, handheld, raw,',
  product_showcase: 'Professional product hero shot, slow zoom,',
  cinematic:        'Cinematic wide shot, dramatic lighting, film grain,',
  behind_scenes:    'Authentic behind-the-scenes, candid,',
  flash_sale:       'Energetic fast-cut, bold colours, urgent,',
  testimonial:      'Warm authentic customer moment, genuine emotion,',
  day_in_life:      'Documentary day-in-the-life, real moments,',
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    business_id, influencer_id, soul_id,
    higgsfield_job_id, scene_image_url,
    prompt, style = 'lifestyle',
    duration_seconds = 10, resolution = '720p',
    mode = 'std', genre = 'auto',
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Verify ownership + reels enabled
  const { data: biz } = await supabaseAdmin.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: prefs } = await supabaseAdmin.from('social_preferences')
    .select('reels_enabled').eq('business_id', business_id).maybeSingle()
  if (prefs && prefs.reels_enabled === false)
    return NextResponse.json({ error: 'reels_not_enabled' }, { status: 403 })

  const dur = Math.min(Math.max(Math.round(duration_seconds), 3), 15)
  const credits = dur <= 10 ? 10 : 20
  const costAud = Math.round(credits * 0.095 * 100) / 100

  const stylePrefix = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.lifestyle
  const videoPrompt = (stylePrefix + ' ' + (prompt ?? 'Australian small business, authentic and warm') + ', 9:16 vertical').slice(0, 500)

  const genPayload: Record<string, any> = {
    model: 'kling3_0',
    prompt: videoPrompt,
    aspect_ratio: '9:16',
    duration: dur,
    resolution,
    mode,
    sound: 'on',
  }
  if (soul_id) genPayload.soul_id = soul_id
  if (higgsfield_job_id) {
    genPayload.medias = [{ value: higgsfield_job_id, role: 'start_image' }]
    if (scene_image_url) genPayload.medias.push({ value: scene_image_url, role: 'end_image' })
  }

  // Create session
  const { data: session } = await supabaseAdmin.from('reel_studio_sessions').insert({
    business_id, influencer_id: influencer_id ?? null, soul_id: soul_id ?? null,
    scene_image_url: scene_image_url ?? null, prompt: videoPrompt,
    style, duration_seconds: dur, status: 'processing',
    cost_aud: costAud, credits_used: credits,
  }).select().single()

  // Call Higgsfield from Vercel (AWS Lambda — no IP block)
  let jobId: string
  try {
    // Diagnostic: log key presence (not value) and payload size
    const keyRaw = process.env.HIGGSFIELD_API_KEY ?? ''
    console.log('[reels/generate] key present:', !!keyRaw, 'key length:', keyRaw.length, 'has colon:', keyRaw.includes(':'), 'payload model:', genPayload.model)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 50000) // 50s timeout
    const res = await fetch(`${HF}/v1/video/generate`, {
      method: 'POST',
      headers: { Authorization: hfAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(genPayload),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const text = await res.text()
    if (!res.ok) {
      // Detect HTML error pages
      if (text.trim().startsWith('<')) throw new Error('Higgsfield API temporarily unavailable. Please try again in 30 seconds.')
      throw new Error(`Higgsfield ${res.status}: ${text.slice(0, 150)}`)
    }
    const d = JSON.parse(text)
    jobId = d.id ?? d.job_id ?? d.request_id
    if (!jobId) throw new Error('No job ID returned: ' + text.slice(0, 150))
  } catch (e: any) {
    await supabaseAdmin.from('reel_studio_sessions').update({ status: 'failed' }).eq('id', session?.id)
    const msg = e.name === 'AbortError'
      ? 'Higgsfield API timed out (50s). Please try again — the API may be busy.'
      : (e.message ?? 'Generation failed')
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  await supabaseAdmin.from('reel_studio_sessions').update({ higgsfield_job_id: jobId }).eq('id', session?.id)
  if (influencer_id) await supabaseAdmin.rpc('increment_influencer_usage', { p_id: influencer_id }).catch(() => {})

  return NextResponse.json({
    job_id: jobId, session_id: session?.id,
    duration: dur, estimated_cost_aud: costAud, status: 'queued',
  })
}
