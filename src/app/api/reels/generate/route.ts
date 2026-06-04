export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Higgsfield blocks Vercel AWS Lambda IPs (522 timeout every time)
// Solution: return the API key + payload to browser, browser calls Higgsfield directly
// Only DB session creation/updates go through Vercel (no IP block for those)

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
    mode = 'std',
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: prefs } = await supabaseAdmin.from('social_preferences')
    .select('reels_enabled').eq('business_id', business_id).maybeSingle()
  if (prefs && prefs.reels_enabled === false)
    return NextResponse.json({ error: 'reels_not_enabled' }, { status: 403 })

  const hfKey = process.env.HIGGSFIELD_API_KEY ?? ''
  if (!hfKey) return NextResponse.json({ error: 'Higgsfield not configured' }, { status: 503 })

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

  // Create DB session (pending) — job_id will be set after browser calls Higgsfield
  const { data: session } = await supabaseAdmin.from('reel_studio_sessions').insert({
    business_id, influencer_id: influencer_id ?? null, soul_id: soul_id ?? null,
    scene_image_url: scene_image_url ?? null, prompt: videoPrompt,
    style, duration_seconds: dur, status: 'pending',
    cost_aud: costAud, credits_used: credits,
  }).select().single()

  // Return key + payload to browser — browser calls Higgsfield directly (bypasses IP block)
  return NextResponse.json({
    session_id: session?.id,
    hf_key: hfKey,
    hf_endpoint: 'https://api.higgsfield.ai/v1/video/generate',
    payload: genPayload,
    duration: dur,
    estimated_cost_aud: costAud,
    mode: 'client_side',
  })
}

// After browser gets the job_id from Higgsfield, it POSTs it here to save to DB
export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { session_id, job_id, status, video_url } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  const updates: Record<string, any> = {}
  if (job_id) updates.higgsfield_job_id = job_id
  if (status) updates.status = status
  if (video_url) { updates.video_url = video_url; updates.completed_at = new Date().toISOString() }

  await supabaseAdmin.from('reel_studio_sessions').update(updates).eq('id', session_id)
  return NextResponse.json({ ok: true })
}
