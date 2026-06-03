export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120 // Veo takes 60-90s to generate

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { put } from '@vercel/blob'

/**
 * POST /api/aria/studio/influencer-video
 * Generates a short Reel of the Aria influencer using Google Veo 2.0.
 * Uses the same GEMINI_API_KEY already in env — zero new credentials needed.
 *
 * Takes her master image as start_frame, animates it with a scene prompt.
 * Output stored to Vercel Blob, saved to aria_studio_assets.
 *
 * Veo 2.0 API: generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:generateVideo
 * Polling: operation name returned, poll until done, download video bytes.
 *
 * UPGRADE_ONLY: add more scene types, never remove existing ones.
 */

const VEO_MODEL = 'veo-2.0-generate-001'

// Scene prompts for different business types — Aria influencer visiting the business
const SCENE_PROMPTS: Record<string, string[]> = {
  cafe: [
    'A young woman with curly dark hair and warm brown skin walks into a cosy Melbourne cafe, smiles warmly at the camera, picks up a coffee cup with both hands, steam rising, morning golden light, candid UGC style, 9:16 vertical, realistic',
    'Close up of a young woman with curly dark hair enjoying a flat white at a Melbourne cafe, she looks at camera and smiles genuinely, warm ambient light, authentic UGC Reel style, 9:16 vertical, photorealistic',
    'A young woman with curly dark hair browses a cafe display of pastries, picks one up, looks delighted, warm bakery lighting, candid iPhone-style video, 9:16 vertical',
  ],
  liquor: [
    'A young woman with curly dark hair and warm brown skin walks through a well-stocked bottle shop, picks up a bottle of wine, examines it with a smile, warm retail lighting, candid UGC style, 9:16 vertical, realistic',
    'Young woman with curly dark hair at a specialty bottle shop, holds up a craft beer bottle, smiles at camera enthusiastically, warm store lighting, authentic Reel style, 9:16 vertical',
  ],
  restaurant: [
    'A young woman with curly dark hair and warm brown skin sits at a restaurant table, a beautiful plate of food arrives, she looks genuinely excited, warm dining room lighting, candid UGC Reel style, 9:16 vertical',
  ],
  bakery: [
    'A young woman with curly dark hair walks into an artisan bakery, the smell of fresh bread visible in her reaction, she picks up a loaf and smells it, warm golden bakery light, candid UGC style, 9:16 vertical',
  ],
  retail: [
    'A young woman with curly dark hair browses a retail store, picks up a product, examines it with interest, looks at camera and gives a thumbs up, bright retail lighting, candid Reel style, 9:16 vertical',
  ],
  other: [
    'A young woman with curly dark hair and warm brown skin visits a local Australian small business, she looks around genuinely impressed, smiles at camera, warm natural lighting, authentic UGC Reel style, 9:16 vertical',
  ],
}

function getScenePrompt(industry: string, customPrompt?: string): string {
  if (customPrompt) return customPrompt
  const scenes = SCENE_PROMPTS[industry] ?? SCENE_PROMPTS.other
  return scenes[Math.floor(Math.random() * scenes.length)]
}

async function pollOperation(operationName: string, apiKey: string, maxAttempts = 20): Promise<string | null> {
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000)) // wait 5s between polls
    const res = await fetch(pollUrl)
    const data = await res.json() as { done?: boolean; response?: { generatedVideos?: Array<{ video?: { uri: string } }> }; error?: { message: string } }
    if (data.error) throw new Error(data.error.message)
    if (data.done && data.response?.generatedVideos?.[0]?.video?.uri) {
      return data.response.generatedVideos[0].video.uri
    }
  }
  return null
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id?: string
    industry?: string
    custom_prompt?: string
    start_image_url?: string // her master image URL from Higgsfield
    duration?: number
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  const industry = body.industry ?? 'other'
  const scenePrompt = getScenePrompt(industry, body.custom_prompt)
  const duration = body.duration ?? 5 // seconds, 5-8 for Reels

  // Build request — image-to-video if start_image_url provided
  const requestBody: Record<string, unknown> = {
    model: VEO_MODEL,
    prompt: { text: scenePrompt },
    generationConfig: {
      durationSeconds: duration,
      aspectRatio: '9:16', // vertical for Reels
    },
  }

  // If we have her master image, use it as start frame for consistency
  if (body.start_image_url) {
    // Fetch image and base64 encode it for the API
    try {
      const imgRes = await fetch(body.start_image_url)
      if (imgRes.ok) {
        const imgBuf = await imgRes.arrayBuffer()
        const base64 = Buffer.from(imgBuf).toString('base64')
        const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg'
        requestBody.image = {
          imageBytes: base64,
          mimeType,
        }
      }
    } catch {
      // Proceed without start frame if image fetch fails
    }
  }

  // Submit to Veo 2.0
  const veoUrl = `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:generateVideo?key=${apiKey}`
  const veoRes = await fetch(veoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  const veoData = await veoRes.json() as { name?: string; error?: { message: string } }
  if (veoData.error) return NextResponse.json({ error: veoData.error.message }, { status: 500 })
  if (!veoData.name) return NextResponse.json({ error: 'No operation name returned from Veo' }, { status: 500 })

  // Poll until video is ready
  const videoUri = await pollOperation(veoData.name, apiKey)
  if (!videoUri) return NextResponse.json({ error: 'Video generation timed out — try again' }, { status: 504 })

  // Download and store to Vercel Blob
  const videoRes = await fetch(videoUri + `&key=${apiKey}`)
  if (!videoRes.ok) return NextResponse.json({ error: 'Failed to download generated video' }, { status: 500 })

  const videoBuffer = await videoRes.arrayBuffer()
  const filename = `aria-influencer/reel-${Date.now()}.mp4`
  const blob = await put(filename, videoBuffer, { access: 'public', contentType: 'video/mp4' })

  // Save to aria_studio_assets if business_id provided
  if (body.business_id) {
    await supabaseAdmin.from('aria_studio_assets').insert({
      business_id: body.business_id,
      prompt: scenePrompt,
      enhanced_prompt: scenePrompt,
      style: 'influencer_reel',
      format: '9:16',
      provider: 'Google Veo 2.0',
      image_url: blob.url,
      folder: 'influencer',
      tags: ['influencer', 'reel', industry, 'aria-character'],
      status: 'ready',
    })
  }

  return NextResponse.json({
    ok: true,
    video_url: blob.url,
    scene_prompt: scenePrompt,
    industry,
    duration,
    provider: 'Google Veo 2.0',
  })
}

export const POST = withErrorCapture('aria/studio/influencer-video', _POST)
