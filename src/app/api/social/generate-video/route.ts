export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { put } from '@vercel/blob'

// Higgsfield API base
const HF_BASE = 'https://api.higgsfield.ai'

function calcCostAUD(durationSec: number): number {
  // Higgsfield pricing: ~0.5 credits per second at $0.05/credit ≈ $0.025 AUD/s
  // Charge owners at $0.056/s to cover costs + margin
  return Math.round(durationSec * 0.056 * 100) / 100
}

// Pick best Higgsfield model based on whether we have a start image + duration
// All models support 9:16 and up to 15s
// For >15s we chain 2 clips (e.g. 2×10s = 20s, 2×15s = 30s)
function pickModel(hasImage: boolean, durationSec: number): string {
  if (hasImage) {
    // seedance_2_0: best for identity/person consistency with start frame
    return 'seedance_2_0'
  }
  // kling3_0: multi-shot, great for text-to-video reels up to 15s
  return 'kling3_0'
}

async function hfPost(path: string, body: object): Promise<any> {
  const apiKey = process.env.HIGGSFIELD_API_KEY
  if (!apiKey) throw new Error('HIGGSFIELD_API_KEY not set')
  const res = await fetch(HF_BASE + path, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error('Higgsfield API ' + res.status + ': ' + err)
  }
  return res.json()
}

async function hfGet(path: string): Promise<any> {
  const apiKey = process.env.HIGGSFIELD_API_KEY
  if (!apiKey) throw new Error('HIGGSFIELD_API_KEY not set')
  const res = await fetch(HF_BASE + path, {
    headers: { 'Authorization': 'Bearer ' + apiKey },
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error('Higgsfield API ' + res.status + ': ' + err)
  }
  return res.json()
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    post_id,
    business_id,
    reel_mode = 'auto',
    reel_style = 'lifestyle',
    reel_custom_prompt,
    reel_source_image_url,
    duration_seconds = 10,
    is_admin = false,
    background_music = 'none',
    influencer_id,
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Auth check — reels enabled
  if (!is_admin) {
    const { data: prefs } = await supabase.from('social_preferences')
      .select('reels_enabled').eq('business_id', business_id).maybeSingle()
    if (!prefs?.reels_enabled) {
      return NextResponse.json({ error: 'reels_not_enabled', message: 'Enable AI Reels in Social Settings first.' }, { status: 403 })
    }
  }

  // Clamp duration — Higgsfield models max 15s per clip
  // For >15s we return clip_count > 1 and the UI chains them
  const PER_CLIP_MAX = 15
  const clipDuration = Math.min(duration_seconds, PER_CLIP_MAX)
  const clipCount = Math.ceil(duration_seconds / PER_CLIP_MAX)

  let post: any = null
  if (post_id) {
    const { data } = await supabase.from('social_posts').select('*').eq('id', post_id).maybeSingle()
    post = data
  }

  // Build prompt
  const STYLE_PREFIXES: Record<string, string> = {
    lifestyle: 'Warm cinematic lifestyle,',
    product_showcase: 'Professional product showcase, slow zoom,',
    behind_scenes: 'Authentic behind-the-scenes, candid light,',
    flash_sale: 'Energetic fast-cut, bold colours, urgency,',
    testimonial: 'Warm authentic customer moment,',
    day_in_life: 'Documentary day-in-the-life, real moments,',
  }
  const stylePrefix = STYLE_PREFIXES[reel_style] ?? STYLE_PREFIXES.lifestyle
  const basePrompt = reel_custom_prompt || post?.reel_concept || post?.caption || 'Australian small business showcase'
  const videoPrompt = (stylePrefix + ' ' + basePrompt + ' 9:16 vertical, photorealistic, no text overlays').slice(0, 500)

  // Source image: influencer photo > uploaded image > post image
  const sourceImageUrl: string | null = reel_source_image_url || post?.image_url || null
  const modelId = pickModel(!!sourceImageUrl, clipDuration)
  const estimatedCost = calcCostAUD(duration_seconds)

  if (!process.env.HIGGSFIELD_API_KEY) {
    return NextResponse.json({ error: 'HIGGSFIELD_API_KEY not configured' }, { status: 503 })
  }

  // Build Higgsfield job payload
  const jobBody: any = {
    model: modelId,
    prompt: videoPrompt,
    aspect_ratio: '9:16',
    duration: clipDuration,
    resolution: '720p',
  }

  // Add start frame if we have a source image
  if (sourceImageUrl) {
    jobBody.medias = [{ value: sourceImageUrl, role: 'start_image' }]
  }

  console.log('[generate-video] Higgsfield submit:', { modelId, duration: clipDuration, clipCount, hasImage: !!sourceImageUrl, influencer_id })

  let jobId: string
  try {
    const result = await hfPost('/v1/video/generate', jobBody)
    jobId = result.id ?? result.job_id
    if (!jobId) throw new Error('No job ID in response: ' + JSON.stringify(result))
  } catch (err: any) {
    console.error('[generate-video] Higgsfield submit failed:', err.message)
    return NextResponse.json({ error: 'video_generation_failed', message: err.message }, { status: 502 })
  }

  // Update post record
  if (post_id) {
    try {
      await supabaseAdmin.from('social_posts').update({
        fal_request_id: jobId,  // reuse column for higgsfield job id
        reel_mode,
        reel_style,
        reel_custom_prompt: reel_custom_prompt || null,
        reel_source_image_url: sourceImageUrl,
        reel_duration_seconds: duration_seconds,
        reel_cost_aud: estimatedCost,
        post_type: 'reel',
        ...(influencer_id ? { influencer_id, influencer_image_url: sourceImageUrl } : {}),
      }).eq('id', post_id)
    } catch {}
  }

  if (influencer_id) {
    try { await supabaseAdmin.rpc('increment_influencer_usage', { p_id: influencer_id }) } catch {}
  }

  // Cost tracking
  try {
    await supabaseAdmin.from('reel_usage_log').insert({
      business_id,
      social_post_id: post_id || null,
      fal_request_id: jobId,
      model: modelId,
      duration_seconds: duration_seconds,
      cost_aud: estimatedCost,
      status: 'processing',
    })
  } catch {}

  return NextResponse.json({
    fal_request_id: jobId,   // keep same field name so polling works
    job_id: jobId,
    model_id: modelId,
    clip_count: clipCount,
    clip_duration: clipDuration,
    total_duration: duration_seconds,
    estimated_cost_aud: estimatedCost,
    status: 'queued',
    provider: 'higgsfield',
  })
}

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('fal_request_id') || req.nextUrl.searchParams.get('job_id')
  const modelId = req.nextUrl.searchParams.get('model_id') || 'seedance_2_0'
  const postId = req.nextUrl.searchParams.get('post_id')

  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  if (!process.env.HIGGSFIELD_API_KEY) return NextResponse.json({ status: 'no_provider' }, { status: 503 })

  try {
    const result = await hfGet('/v1/video/generate/' + jobId)
    const status: string = result.status ?? 'UNKNOWN'

    // Higgsfield statuses: pending, processing, completed, failed
    if (status === 'completed' || status === 'COMPLETED') {
      const videoUrl: string = result.video_url ?? result.url ?? result.output?.url

      if (!videoUrl) return NextResponse.json({ status: 'FAILED', error: 'No video URL in result' })

      // Save to Vercel Blob for permanent hosting
      let finalVideoUrl = videoUrl
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const blobKey = 'aria-social/reels/' + (postId || jobId) + '-' + Date.now() + '.mp4'
          const vRes = await fetch(videoUrl)
          const vBuf = await vRes.arrayBuffer()
          const blob = await put(blobKey, vBuf, { access: 'public', contentType: 'video/mp4' })
          finalVideoUrl = blob.url
        } catch {}
      }

      if (postId) {
        try {
          await supabaseAdmin.from('social_posts').update({ video_url: finalVideoUrl, post_type: 'reel' }).eq('id', postId)
          await supabaseAdmin.from('reel_usage_log').update({ status: 'completed' }).eq('fal_request_id', jobId)
        } catch {}
      }

      return NextResponse.json({ status: 'COMPLETED', video_url: finalVideoUrl })
    }

    if (status === 'failed' || status === 'FAILED') {
      try { await supabaseAdmin.from('reel_usage_log').update({ status: 'failed' }).eq('fal_request_id', jobId) } catch {}
      return NextResponse.json({ status: 'FAILED', error: result.error || 'Generation failed' })
    }

    // Still processing
    return NextResponse.json({ status: 'IN_QUEUE' })
  } catch (err: any) {
    console.error('[generate-video GET] status check error:', err.message)
    return NextResponse.json({ status: 'error', error: err.message }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/generate-video', _POST)
export const GET = withErrorCapture('social/generate-video', _GET)
