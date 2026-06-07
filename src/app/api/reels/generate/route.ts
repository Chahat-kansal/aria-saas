export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const FAL_KEY = process.env.FAL_API_KEY ?? ''
const FAL_T2V = 'fal-ai/kling-video/v2.1/master/text-to-video'
const FAL_I2V = 'fal-ai/kling-video/v2.1/pro/image-to-video'

// Derives a stable 32-bit seed from an influencer UUID — no DB column needed.
// Same influencer → same seed every call → consistent face across runs.
function uuidToSeed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i) | 0
  }
  return Math.abs(h)
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

  if (!FAL_KEY) return NextResponse.json({ error: 'FAL_API_KEY not configured' }, { status: 503 })

  const {
    business_id, influencer_id,
    image_url,        // influencer image_url hint from client (overridden by DB below)
    background_url,   // user-uploaded background (cafe/shop photo)
    scene_image_url,  // user-uploaded scene photo
    prompt, style = 'lifestyle', duration_seconds = 10,
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // ── Influencer identity anchor (resolve BEFORE session creation) ──────────────
  // DB is the authoritative source for image_url — client hint is only a fallback.
  // If influencer_id is set and has no image_url in DB, we MUST fail: falling back
  // to text-to-video for a selected influencer would produce a random face (bug #1).
  let resolvedInfluencerImage: string | null = null
  let influencerSeed: number | null = null

  if (influencer_id) {
    const { data: inf } = await supabaseAdmin
      .from('aria_influencer_library')
      .select('image_url')
      .eq('id', influencer_id)
      .maybeSingle()

    resolvedInfluencerImage = inf?.image_url ?? (image_url as string | null) ?? null

    if (!resolvedInfluencerImage) {
      return NextResponse.json({
        error: 'This influencer has no reference image — face identity cannot be anchored. Please contact support.',
      }, { status: 422 })
    }

    // Stable per-influencer seed derived from the UUID (no DB column needed).
    // Same influencer → same seed every call → consistent generation across runs.
    influencerSeed = uuidToSeed(influencer_id)
  }

  // Rate limit: 25/day
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const { count } = await supabaseAdmin.from('reel_studio_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business_id).gte('created_at', dayStart.toISOString())
  if ((count ?? 0) >= 25)
    return NextResponse.json({ error: 'Daily reel limit reached (25/day).' }, { status: 429 })

  // fal.ai duration must be string "5" or "10"
  const dur = duration_seconds >= 10 ? '10' : '5'
  const durNum = parseInt(dur)
  const costAud = Math.round(durNum * 0.07 * 1.55 * 100) / 100

  const stylePrefix = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.lifestyle
  const videoPrompt = (stylePrefix + ' ' + (prompt ?? 'Australian small business owner, authentic and warm') + ', 9:16 vertical').slice(0, 500)

  const { data: session } = await supabaseAdmin.from('reel_studio_sessions').insert({
    business_id,
    influencer_id: influencer_id ?? null,
    prompt: videoPrompt,
    style,
    duration_seconds: durNum,
    status: 'processing',
    cost_aud: costAud,
    credits_used: durNum,
  }).select().single()

  // Influencer image anchors face identity (I2V); scene photo is secondary for non-influencer;
  // no reference → text-to-video. Never fall back to T2V when an influencer is selected.
  const referenceImage = resolvedInfluencerImage ?? scene_image_url ?? null
  const model = referenceImage ? FAL_I2V : FAL_T2V

  // If background provided, enrich the prompt with it
  const enrichedPrompt = background_url
    ? videoPrompt + ', set in the uploaded background location'
    : videoPrompt

  const falBody: Record<string, any> = {
    prompt: enrichedPrompt.slice(0, 500),
    duration: dur,
    aspect_ratio: '9:16',
    negative_prompt: 'blur, distort, low quality, text, watermark',
  }
  if (referenceImage) falBody.image_url = referenceImage
  // Stable seed keeps the influencer's face consistent across repeat generations.
  // Note: reference image is the primary identity anchor; seed reinforces consistency.
  if (influencerSeed !== null) falBody.seed = influencerSeed

  try {
    const webhookUrl = 'https://www.ariaos.site/api/reels/fal-webhook'
    const res = await fetch(`https://queue.fal.run/${model}?fal_webhook=${encodeURIComponent(webhookUrl)}`, {
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(falBody),
      signal: AbortSignal.timeout(12000),
    })

    // Read as text first — fal.ai sometimes returns non-JSON error pages (e.g. 504 HTML)
    const raw = await res.text()
    console.log('[reels/generate] fal submit:', res.status, 'model:', model, raw.slice(0, 200))

    let data: any
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error(`fal.ai returned non-JSON (${res.status}): ${raw.slice(0, 80)}`)
    }

    if (!res.ok) throw new Error(`fal.ai ${res.status}: ${data.detail ?? JSON.stringify(data).slice(0, 100)}`)

    const { request_id, status_url, response_url } = data
    if (!request_id) throw new Error('No request_id from fal.ai: ' + JSON.stringify(data).slice(0, 100))

    // Save status_url and response_url — these are the EXACT URLs fal.ai wants us to poll
    await supabaseAdmin.from('reel_studio_sessions').update({
      higgsfield_job_id: request_id,
      fal_model: status_url ?? model,   // store status_url in fal_model column temporarily
      scene_image_url: response_url ?? null, // store response_url in scene_image_url temporarily
    }).eq('id', session?.id)

    return NextResponse.json({
      job_id: request_id,
      session_id: session?.id,
      status_url,
      response_url,
      duration: durNum,
      estimated_cost_aud: costAud,
    })
  } catch (e: any) {
    await supabaseAdmin.from('reel_studio_sessions').update({ status: 'failed' }).eq('id', session?.id)
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
