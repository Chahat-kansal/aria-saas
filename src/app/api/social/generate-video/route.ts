export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { put } from '@vercel/blob'

// Pricing: 4000 credits = $190 AUD → $0.0475/credit
// kling3_0: 20 credits/10s = $0.95, 30 credits/15s = $1.43
// To stay under $2 AUD: max 20s (2x10s clips = $1.90) or 15s single ($1.43)
const CREDITS_PER_AUD = 4000 / 190  // ~21.05 credits per $1 AUD
const CREDITS_10S = 20
const CREDITS_15S = 30

function calcCostAUD(durationSec: number): number {
  const clips = Math.ceil(durationSec / 10)
  const credits = clips * CREDITS_10S
  return Math.round((credits / CREDITS_PER_AUD) * 100) / 100
}

async function hgPost(path: string, body: object) {
  const key = process.env.HIGGSFIELD_API_KEY
  if (!key) throw new Error('HIGGSFIELD_API_KEY not set')
  const res = await fetch('https://api.higgsfield.ai' + path, {
    method: 'POST',
    headers: { Authorization: key.replace(/^Bearer\s+/i,'').replace(/^Key\s+/i,''), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error('Higgsfield ' + res.status + ': ' + text)
  return JSON.parse(text)
}

async function hgGet(path: string) {
  const key = process.env.HIGGSFIELD_API_KEY
  if (!key) throw new Error('HIGGSFIELD_API_KEY not set')
  const res = await fetch('https://api.higgsfield.ai' + path, {
    headers: { Authorization: 'Bearer ' + key },
  })
  const text = await res.text()
  if (!res.ok) throw new Error('Higgsfield ' + res.status + ': ' + text)
  return JSON.parse(text)
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    post_id, business_id,
    reel_mode = 'auto',
    reel_style = 'lifestyle',
    reel_custom_prompt,
    reel_source_image_url,
    duration_seconds = 10,
    is_admin = false,
    influencer_id,
    influencer_job_id,     // higgsfield_job_id from aria_influencer_library — native HF asset
    owner_image_job_id,    // job_id from an owner-uploaded/generated image
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  if (!is_admin) {
    const { data: prefs } = await supabase.from('social_preferences')
      .select('reels_enabled').eq('business_id', business_id).maybeSingle()
    if (!prefs?.reels_enabled) {
      return NextResponse.json({ error: 'reels_not_enabled', message: 'Enable AI Reels in Social Settings first.' }, { status: 403 })
    }
  }

  if (!process.env.HIGGSFIELD_API_KEY) {
    return NextResponse.json({ error: 'HIGGSFIELD_API_KEY not configured. Add it in Vercel environment variables.' }, { status: 503 })
  }

  // Clamp duration to 10s per clip (Kling 3.0 max that stays under $2 for 2 clips)
  const clampedDuration = Math.min(Math.max(duration_seconds, 5), 10)
  const estimatedCost = calcCostAUD(clampedDuration)

  let post: any = null
  if (post_id) {
    const { data } = await supabase.from('social_posts').select('*').eq('id', post_id).maybeSingle()
    post = data
  }

  // Build prompt
  const STYLES: Record<string, string> = {
    lifestyle: 'Warm cinematic lifestyle shot,',
    product_showcase: 'Professional product showcase, slow zoom,',
    behind_scenes: 'Authentic behind-the-scenes, candid,',
    flash_sale: 'Energetic fast-cut, bold colours,',
    testimonial: 'Warm authentic customer moment,',
    day_in_life: 'Documentary day-in-the-life,',
  }
  const prefix = STYLES[reel_style] ?? STYLES.lifestyle
  const basePrompt = reel_custom_prompt || post?.reel_concept || post?.caption || 'Australian small business showcase'
  const prompt = (prefix + ' ' + basePrompt + ', authentic UGC style, 9:16 vertical, cinematic, no text overlays').slice(0, 500)

  // Start frame: influencer job ID > owner uploaded image job ID > null (text-to-video)
  // CRITICAL: must be a Higgsfield-native job ID (UUID), NOT a cloudfront URL
  const startFrameJobId: string | null = influencer_job_id || owner_image_job_id || null

  const jobBody: Record<string, any> = {
    model: 'kling3_0',
    prompt,
    aspect_ratio: '9:16',
    duration: clampedDuration,
    mode: 'std',
    sound: 'on',
  }

  if (startFrameJobId) {
    jobBody.medias = [{ value: startFrameJobId, role: 'start_image' }]
  }

  console.log('[generate-video] submitting to Higgsfield:', {
    model: 'kling3_0',
    duration: clampedDuration,
    hasStartFrame: !!startFrameJobId,
    influencer_id,
    estimatedCost,
  })

  let jobId: string
  try {
    const result = await hgPost('/v1/video/generate', jobBody)
    jobId = result.id ?? result.job_id ?? result.request_id
    if (!jobId) throw new Error('No job ID returned: ' + JSON.stringify(result))
  } catch (err: any) {
    console.error('[generate-video] Higgsfield failed:', err.message)
    return NextResponse.json({ error: 'generation_failed', message: err.message }, { status: 502 })
  }

  if (post_id) {
    try {
      await supabaseAdmin.from('social_posts').update({
        fal_request_id: jobId,
        reel_mode, reel_style,
        reel_custom_prompt: reel_custom_prompt || null,
        reel_duration_seconds: clampedDuration,
        reel_cost_aud: estimatedCost,
        post_type: 'reel',
        ...(influencer_id ? { influencer_id } : {}),
      }).eq('id', post_id)
    } catch {}
  }

  if (influencer_id) {
    try { await supabaseAdmin.rpc('increment_influencer_usage', { p_id: influencer_id }) } catch {}
  }

  try {
    await supabaseAdmin.from('reel_usage_log').insert({
      business_id,
      social_post_id: post_id || null,
      fal_request_id: jobId,
      model: 'kling3_0_higgsfield',
      duration_seconds: clampedDuration,
      cost_aud: estimatedCost,
      status: 'processing',
    })
  } catch {}

  return NextResponse.json({
    fal_request_id: jobId,
    job_id: jobId,
    model_id: 'kling3_0',
    duration: clampedDuration,
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
  const postId = req.nextUrl.searchParams.get('post_id')
  const businessId = req.nextUrl.searchParams.get('business_id')

  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  if (!process.env.HIGGSFIELD_API_KEY) return NextResponse.json({ status: 'no_provider' }, { status: 503 })

  try {
    const result = await hgGet('/v1/video/' + jobId)
    const status: string = (result.status ?? '').toLowerCase()

    if (status === 'completed') {
      const videoUrl: string = result.video_url ?? result.url ?? result.output?.url ?? result.output?.video_url
      if (!videoUrl) return NextResponse.json({ status: 'FAILED', error: 'No video URL in result' })

      let finalUrl = videoUrl
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const blobKey = 'aria-social/reels/' + (postId || jobId) + '-' + Date.now() + '.mp4'
          const vRes = await fetch(videoUrl)
          const vBuf = await vRes.arrayBuffer()
          const blob = await put(blobKey, vBuf, { access: 'public', contentType: 'video/mp4' })
          finalUrl = blob.url
        } catch (e: any) {
          console.warn('[generate-video] blob upload failed, using direct URL:', e.message)
        }
      }

      if (postId) {
        try { await supabaseAdmin.from('social_posts').update({ video_url: finalUrl, post_type: 'reel' }).eq('id', postId) } catch {}
        try { await supabaseAdmin.from('reel_usage_log').update({ status: 'completed' }).eq('fal_request_id', jobId) } catch {}
      }

      return NextResponse.json({ status: 'COMPLETED', video_url: finalUrl })
    }

    if (status === 'failed' || status === 'error') {
      try { await supabaseAdmin.from('reel_usage_log').update({ status: 'failed' }).eq('fal_request_id', jobId) } catch {}
      return NextResponse.json({ status: 'FAILED', error: result.error || 'Generation failed' })
    }

    // pending / processing / in_queue
    return NextResponse.json({ status: 'IN_QUEUE' })

  } catch (err: any) {
    console.error('[generate-video GET]', err.message)
    return NextResponse.json({ status: 'error', error: err.message }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/generate-video', _POST)
export const GET = withErrorCapture('social/generate-video', _GET)
