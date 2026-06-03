export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { put } from '@vercel/blob'

const HIGGSFIELD_API = 'https://api.higgsfield.ai'

// Higgsfield model routing by duration + whether we have a start image
// All models support 9:16 aspect ratio, up to 15s
function pickModel(durationSec: number, hasImage: boolean): { model: string; maxDuration: number } {
  if (hasImage) {
    // Image-to-video: Seedance 2.0 is best for identity/influencer consistency
    return { model: 'seedance_2_0', maxDuration: 15 }
  }
  // Text-to-video: Wan 2.7 supports up to 15s with audio sync
  return { model: 'wan2_7', maxDuration: 15 }
}

function calcCostAUD(durationSec: number): number {
  // Approximate: Higgsfield charges per credit, ~$0.05–0.08 AUD per second
  return Math.round(durationSec * 0.07 * 100) / 100
}

const STYLE_PROMPTS: Record<string, string> = {
  lifestyle:        'Warm cinematic lifestyle shot,',
  product_showcase: 'Professional product showcase, clean background, slow zoom,',
  behind_scenes:    'Authentic behind-the-scenes, candid, natural lighting,',
  flash_sale:       'Energetic fast-cut, bold colours, urgency,',
  testimonial:      'Warm authentic customer moment, genuine smile,',
  day_in_life:      'Documentary-style day-in-the-life, real moments,',
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
    background_music = 'none',
    influencer_id,
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Auth gate: check reels enabled
  if (!is_admin) {
    const { data: prefs } = await supabase.from('social_preferences')
      .select('reels_enabled').eq('business_id', business_id).maybeSingle()
    if (!prefs?.reels_enabled) {
      return NextResponse.json({
        error: 'reels_not_enabled',
        message: 'Enable AI Reels in Social Settings first.',
      }, { status: 403 })
    }
  }

  const higgsfieldKey = process.env.HIGGSFIELD_API_KEY
  if (!higgsfieldKey) {
    return NextResponse.json({
      error: 'HIGGSFIELD_API_KEY not configured',
      message: 'Add HIGGSFIELD_API_KEY to Vercel environment variables.',
    }, { status: 503 })
  }

  let post: Record<string, unknown> | null = null
  if (post_id) {
    const { data } = await supabase.from('social_posts').select('*').eq('id', post_id).maybeSingle()
    post = data
  }

  const stylePrefix = STYLE_PROMPTS[reel_style] ?? STYLE_PROMPTS.lifestyle
  const customPrompt = reel_custom_prompt || (post?.reel_concept as string) || (post?.caption as string) || 'Australian small business showcase'
  const videoPrompt = (stylePrefix + ' ' + customPrompt + ' 9:16 vertical, photorealistic, vibrant, no text overlays').slice(0, 500)

  // Source image: influencer photo takes priority, then uploaded image, then post image
  const sourceImageUrl: string | null = reel_source_image_url || (post?.image_url as string) || null
  const clampedDuration = Math.max(3, Math.min(15, duration_seconds))
  const { model } = pickModel(clampedDuration, !!sourceImageUrl)
  const estimatedCost = calcCostAUD(clampedDuration)

  console.log('[generate-video] submitting to Higgsfield:', { model, duration: clampedDuration, hasImage: !!sourceImageUrl, influencer_id })

  // Build Higgsfield generation payload
  const payload: Record<string, unknown> = {
    model,
    prompt: videoPrompt,
    aspect_ratio: '9:16',
    duration: clampedDuration,
    resolution: '720p',
  }

  // Attach start image if available (for image-to-video)
  if (sourceImageUrl) {
    payload.medias = [{ value: sourceImageUrl, role: 'start_image' }]
  }

  // Submit to Higgsfield
  let jobId: string
  try {
    const res = await fetch(`${HIGGSFIELD_API}/v1/video/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${higgsfieldKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      console.error('[generate-video] Higgsfield error:', res.status, errText)
      return NextResponse.json({
        error: 'generation_failed',
        message: `Higgsfield error ${res.status}: ${errText}`,
      }, { status: 502 })
    }

    const data = await res.json()
    jobId = data.id || data.job_id || data.request_id
    if (!jobId) throw new Error('No job ID in Higgsfield response: ' + JSON.stringify(data))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[generate-video] Higgsfield submit failed:', msg)
    return NextResponse.json({ error: 'generation_failed', message: msg }, { status: 502 })
  }

  // Save to DB
  if (post_id) {
    try {
      await supabaseAdmin.from('social_posts').update({
        fal_request_id: jobId, // reuse column for job tracking
        reel_mode, reel_style,
        reel_custom_prompt: reel_custom_prompt || null,
        reel_duration_seconds: clampedDuration,
        reel_cost_aud: estimatedCost,
        post_type: 'reel',
        ...(influencer_id ? { influencer_id, influencer_image_url: sourceImageUrl || null } : {}),
      }).eq('id', post_id)
    } catch {}
  }

  if (influencer_id) {
    try { await supabaseAdmin.rpc('increment_influencer_usage', { p_id: influencer_id }) } catch {}
  }

  // Log cost
  try {
    await supabaseAdmin.from('reel_usage_log').insert({
      business_id, social_post_id: post_id || null,
      fal_request_id: jobId, model,
      duration_seconds: clampedDuration,
      cost_aud: estimatedCost,
      status: 'processing',
    })
  } catch {}

  return NextResponse.json({
    fal_request_id: jobId,
    model_id: model,
    estimated_cost_aud: estimatedCost,
    status: 'queued',
    background_music,
    duration_seconds: clampedDuration,
  })
}

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('fal_request_id') || req.nextUrl.searchParams.get('request_id')
  const model_id = req.nextUrl.searchParams.get('model_id') || 'seedance_2_0'
  const post_id = req.nextUrl.searchParams.get('post_id')
  const business_id = req.nextUrl.searchParams.get('business_id')

  if (!jobId) return NextResponse.json({ error: 'fal_request_id required' }, { status: 400 })

  const higgsfieldKey = process.env.HIGGSFIELD_API_KEY
  if (!higgsfieldKey) return NextResponse.json({ status: 'no_provider' }, { status: 503 })

  try {
    const res = await fetch(`${HIGGSFIELD_API}/v1/video/job/${jobId}`, {
      headers: { 'Authorization': `Bearer ${higgsfieldKey}` },
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      console.error('[generate-video GET] Higgsfield status error:', res.status, errText)
      return NextResponse.json({ status: 'error', error: errText }, { status: 500 })
    }

    const data = await res.json()
    const status = (data.status || '').toUpperCase()

    // Higgsfield statuses: pending, processing, completed, failed
    if (status === 'COMPLETED' || data.result_url || data.video_url) {
      const rawVideoUrl: string = data.result_url || data.video_url || data.output?.video_url

      if (!rawVideoUrl) return NextResponse.json({ status: 'FAILED', error: 'No video URL in response' })

      // Upload to Vercel Blob for CDN
      let finalVideoUrl = rawVideoUrl
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const blobKey = 'aria-social/reels/' + (post_id || jobId) + '-' + Date.now() + '.mp4'
          const vRes = await fetch(rawVideoUrl)
          const vBuf = await vRes.arrayBuffer()
          const blob = await put(blobKey, vBuf, { access: 'public', contentType: 'video/mp4' })
          finalVideoUrl = blob.url
        } catch (e: unknown) {
          console.error('[generate-video] blob upload failed:', e instanceof Error ? e.message : String(e))
          // Fall back to direct URL
        }
      }

      if (post_id) {
        try {
          await supabaseAdmin.from('social_posts').update({ post_type: 'reel' }).eq('id', post_id)
        } catch {}
      }

      // Update reel_usage_log status
      if (jobId) {
        try {
          await supabaseAdmin.from('reel_usage_log').update({ status: 'completed' }).eq('fal_request_id', jobId)
        } catch {}
      }

      return NextResponse.json({ status: 'COMPLETED', video_url: finalVideoUrl })
    }

    if (status === 'FAILED' || status === 'ERROR') {
      if (jobId) {
        try { await supabaseAdmin.from('reel_usage_log').update({ status: 'failed' }).eq('fal_request_id', jobId) } catch {}
      }
      return NextResponse.json({ status: 'FAILED', error: data.error || 'Generation failed' })
    }

    // Still processing
    return NextResponse.json({ status: status || 'IN_PROGRESS' })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[generate-video GET] error:', msg)
    return NextResponse.json({ status: 'error', error: msg }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/generate-video', _POST)
export const GET = withErrorCapture('social/generate-video', _GET)
