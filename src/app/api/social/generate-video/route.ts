export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const VEO_MODEL = 'veo-2.0-generate-001'
const FAL_MODEL = 'fal-ai/kling-video/v2.1/standard/image-to-video'

/**
 * POST /api/social/generate-video
 * Provider priority: fal.ai Kling 2.1 → Google Veo 2.0 → Runway → Replicate
 * UPGRADE_ONLY: add providers, never remove existing ones.
 *
 * GET /api/social/generate-video?request_id=xxx
 * Poll fal.ai job status.
 */

function calcReelCost(durationSeconds: number): number {
  const clips = Math.ceil(durationSeconds / 10)
  const costPerClip = 0.28 + 5 * 0.056 // Kling 2.1 Standard 10s clip
  return Math.round(clips * costPerClip * 100) / 100
}

// ── fal.ai Kling 2.1 — primary ─────────────────────────────────────────────
async function startFal(
  prompt: string, imageUrl: string | undefined, durationSeconds: number
): Promise<{ jobId: string; provider: string; requestId: string } | null> {
  const key = process.env.FAL_KEY
  if (!key || !imageUrl) return null  // image-to-video requires a start frame
  try {
    // Dynamic import to avoid top-level side effects from fal.config
    const { fal } = await import('@fal-ai/client')
    fal.config({ credentials: key })
    const clampedDur = durationSeconds <= 5 ? '5' : '10'
    const result = await fal.queue.submit(FAL_MODEL, {
      input: {
        prompt: prompt.slice(0, 512),
        image_url: imageUrl,
        duration: clampedDur,
      },
    })
    const reqId = (result as any).request_id as string | undefined
    if (!reqId) return null
    return { jobId: 'fal:' + reqId, provider: 'fal.ai Kling 2.1', requestId: reqId }
  } catch (e: any) {
    console.error('[fal] submit error:', e?.message ?? e)
    return null
  }
}

// ── Google Veo 2.0 — fallback 1 ────────────────────────────────────────────
async function startVeo(prompt: string, imageUrl?: string): Promise<{ jobId: string; provider: string } | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const requestBody: Record<string, unknown> = {
    model: VEO_MODEL,
    prompt: { text: prompt.slice(0, 1000) },
    generationConfig: { durationSeconds: 5, aspectRatio: '9:16' },
  }

  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl)
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer()
        requestBody.image = {
          imageBytes: Buffer.from(buf).toString('base64'),
          mimeType: imgRes.headers.get('content-type') ?? 'image/jpeg',
        }
      }
    } catch { /* proceed without start frame */ }
  }

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + VEO_MODEL + ':generateVideo?key=' + key,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }
    )
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('[veo] API error:', res.status, err.slice(0, 200))
      return null
    }
    const d = await res.json() as { name?: string; error?: { message: string } }
    if (d.error) { console.error('[veo] error:', d.error.message); return null }
    if (!d.name) return null
    return { jobId: 'veo:' + d.name, provider: 'Google Veo 2.0' }
  } catch (e: any) {
    console.error('[veo] exception:', e?.message ?? e)
    return null
  }
}

// ── Runway Gen4 Turbo — fallback 2 ─────────────────────────────────────────
async function startRunway(prompt: string, imageUrl?: string): Promise<{ jobId: string; provider: string } | null> {
  const key = process.env.RUNWAY_API_KEY
  if (!key) return null
  try {
    const endpoint = imageUrl ? 'image_to_video' : 'text_to_video'
    const body: Record<string, unknown> = imageUrl
      ? { model: 'gen4_turbo', promptImage: imageUrl, promptText: prompt.slice(0, 512), duration: 5, ratio: '720:1280' }
      : { model: 'gen4_turbo', promptText: prompt.slice(0, 512), duration: 5, ratio: '720:1280' }
    const res = await fetch('https://api.dev.runwayml.com/v1/' + endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.id ? { jobId: 'runway:' + d.id, provider: 'Runway Gen4' } : null
  } catch { return null }
}

// ── Replicate SVD — fallback 3 (last resort) ───────────────────────────────
async function startReplicate(prompt: string): Promise<{ jobId: string; provider: string } | null> {
  const key = process.env.REPLICATE_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: 'Token ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'dce698e891f2ec379db3b3a2fbc0ce7a',
        input: { prompt: prompt.slice(0, 512), num_frames: 25, width: 576, height: 1024 },
      }),
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.id ? { jobId: 'replicate:' + d.id, provider: 'Replicate SVD' } : null
  } catch { return null }
}

// ── GET — poll fal.ai job status ────────────────────────────────────────────
async function _GET(req: Request) {
  const url = new URL(req.url)
  const requestId = url.searchParams.get('request_id')
  if (!requestId) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.FAL_KEY
  if (!key) return NextResponse.json({ status: 'no_provider' }, { status: 503 })

  try {
    const { fal } = await import('@fal-ai/client')
    fal.config({ credentials: key })

    const status = await fal.queue.status(FAL_MODEL, { requestId, logs: false })
    const statusStr = (status as any).status as string

    if (statusStr === 'COMPLETED') {
      const output = await fal.queue.result(FAL_MODEL, { requestId })
      const videoUrl = ((output as any).data as any)?.video?.url as string | undefined
      return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl ?? null })
    }
    if (statusStr === 'FAILED') {
      return NextResponse.json({ status: 'FAILED' })
    }
    return NextResponse.json({ status: statusStr })
  } catch (e: any) {
    console.error('[generate-video GET] fal status error:', e?.message ?? e)
    return NextResponse.json({ status: 'error', error: e?.message ?? 'unknown' }, { status: 500 })
  }
}

// ── POST — submit video generation ─────────────────────────────────────────
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, image_url, business_id, post_id, duration_seconds, post_type } = await req.json() as {
    prompt?: string; image_url?: string; business_id?: string; post_id?: string;
    duration_seconds?: number; post_type?: string
  }

  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const dur = typeof duration_seconds === 'number' && duration_seconds > 0 ? duration_seconds : 10

  // Reels gate — check opt-in
  if (business_id) {
    const { data: prefs } = await supabase.from('social_preferences')
      .select('reels_enabled').eq('business_id', business_id).maybeSingle()
    if (!prefs?.reels_enabled) {
      return NextResponse.json({
        error: 'reels_not_enabled',
        message: 'AI Reels is not enabled for this business. Enable it in Social Settings to generate video content.',
      }, { status: 403 })
    }
  }

  const estimatedCost = calcReelCost(dur)
  const effectivePostType = post_type === 'story' ? 'story' : 'reel'

  // ── Try fal.ai Kling 2.1 first ─────────────────────────────────────────
  const falResult = await startFal(prompt, image_url, dur)

  if (falResult) {
    if (business_id) {
      try { await supabaseAdmin.from('reel_usage_log').insert({
        business_id,
        post_id: post_id ?? null,
        cost_aud: estimatedCost,
        duration_seconds: dur,
        provider: falResult.provider,
        fal_request_id: falResult.requestId,
      }) } catch {}
    }
    if (post_id) {
      try { await supabaseAdmin.from('social_posts').update({
        fal_request_id: falResult.requestId,
        reel_cost_aud: estimatedCost,
        reel_duration_seconds: dur,
        post_type: effectivePostType,
      }).eq('id', post_id) } catch {}
    }
    return NextResponse.json({
      fal_request_id: falResult.requestId,
      job_id: falResult.jobId,
      provider: falResult.provider,
      estimated_cost_aud: estimatedCost,
      status: 'queued',
    })
  }

  // ── Fallbacks: Veo → Runway → Replicate ──────────────────────────────
  const result = await startVeo(prompt, image_url)
    ?? await startRunway(prompt, image_url)
    ?? await startReplicate(prompt)

  if (!result) {
    return NextResponse.json({
      error: 'no_provider',
      message: 'No video provider available. FAL_KEY, GEMINI_API_KEY, or RUNWAY_API_KEY should be set.',
    }, { status: 503 })
  }

  if (business_id) {
    try { await supabaseAdmin.from('reel_usage_log').insert({
      business_id,
      post_id: post_id ?? null,
      cost_aud: estimatedCost,
      duration_seconds: dur,
      provider: result.provider,
      fal_request_id: null,
    }) } catch {}
    // Also log to aria_studio_assets for billing tracking (Veo charges per second)
    try { await supabaseAdmin.from('aria_studio_assets').insert({
      business_id,
      prompt,
      enhanced_prompt: prompt,
      style: 'reel',
      format: '9:16',
      provider: result.provider,
      image_url: null,
      folder: 'reels',
      tags: ['reel', 'video', 'auto-generated'],
      status: 'processing',
    }).select().single() } catch {}
  }
  if (post_id) {
    try { await supabaseAdmin.from('social_posts').update({
      reel_cost_aud: estimatedCost,
      reel_duration_seconds: dur,
      post_type: effectivePostType,
    }).eq('id', post_id) } catch {}
  }

  return NextResponse.json({
    job_id: result.jobId,
    provider: result.provider,
    estimated_cost_aud: estimatedCost,
    status: 'queued',
  })
}

export const GET = withErrorCapture('social/generate-video/poll', _GET)
export const POST = withErrorCapture('social/generate-video', _POST)
