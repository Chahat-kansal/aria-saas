export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { put } from '@vercel/blob'

const VEO_MODEL = 'veo-2.0-generate-001'

/**
 * POST /api/social/generate-video
 * Generates a short Reel for a social post.
 *
 * Provider priority:
 *   1. Google Veo 2.0 (GEMINI_API_KEY — already in env, best quality, 9:16 native)
 *   2. Runway Gen4 Turbo (RUNWAY_API_KEY — optional fallback)
 *   3. Replicate SVD (REPLICATE_API_KEY — last resort)
 *
 * Gated: requires reels_enabled = true on social_preferences for this business.
 * UPGRADE_ONLY: add providers, never remove existing ones.
 */

async function startVeo(prompt: string, imageUrl?: string): Promise<{ jobId: string; provider: string } | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const requestBody: Record<string, unknown> = {
    model: VEO_MODEL,
    prompt: { text: prompt.slice(0, 1000) },
    generationConfig: {
      durationSeconds: 5,
      aspectRatio: '9:16', // vertical — native Reels format
    },
  }

  // Use image as start frame if provided — improves relevance
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
    } catch { /* proceed without */ }
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:generateVideo?key=${key}`,
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
    return { jobId: `veo:${d.name}`, provider: 'Google Veo 2.0' }
  } catch (e) {
    console.error('[veo] exception:', e)
    return null
  }
}

async function startRunway(prompt: string, imageUrl?: string): Promise<{ jobId: string; provider: string } | null> {
  const key = process.env.RUNWAY_API_KEY
  if (!key) return null
  try {
    const endpoint = imageUrl ? 'image_to_video' : 'text_to_video'
    const body: Record<string, unknown> = imageUrl
      ? { model: 'gen4_turbo', promptImage: imageUrl, promptText: prompt.slice(0, 512), duration: 5, ratio: '720:1280' }
      : { model: 'gen4_turbo', promptText: prompt.slice(0, 512), duration: 5, ratio: '720:1280' }
    const res = await fetch(`https://api.dev.runwayml.com/v1/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.id ? { jobId: `runway:${d.id}`, provider: 'Runway Gen4' } : null
  } catch { return null }
}

async function startReplicate(prompt: string): Promise<{ jobId: string; provider: string } | null> {
  const key = process.env.REPLICATE_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'dce698e891f2ec379db3b3a2fbc0ce7a',
        input: { prompt: prompt.slice(0, 512), num_frames: 25, width: 576, height: 1024 },
      }),
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.id ? { jobId: `replicate:${d.id}`, provider: 'Replicate SVD' } : null
  } catch { return null }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, image_url, business_id, post_id } = await req.json() as {
    prompt?: string; image_url?: string; business_id?: string; post_id?: string
  }

  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  // ── Reels gate: check opt-in ──────────────────────────────────────────
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

  // ── Try providers in priority order ──────────────────────────────────
  const result = await startVeo(prompt, image_url)
    ?? await startRunway(prompt, image_url)
    ?? await startReplicate(prompt)

  if (!result) {
    return NextResponse.json({
      error: 'no_provider',
      message: 'No video provider available. GEMINI_API_KEY should be set — check runtime logs.',
    }, { status: 503 })
  }

  // Log to aria_studio_assets for billing tracking (Veo charges per second)
  if (business_id) {
    await supabaseAdmin.from('aria_studio_assets').insert({
      business_id,
      prompt,
      enhanced_prompt: prompt,
      style: 'reel',
      format: '9:16',
      provider: result.provider,
      image_url: null, // video — URL will be set when polling resolves
      folder: 'reels',
      tags: ['reel', 'video', 'auto-generated'],
      status: 'processing',
    }).select().single().catch(() => null)
  }

  return NextResponse.json({ job_id: result.jobId, provider: result.provider })
}

export const POST = withErrorCapture('social/generate-video', _POST)
