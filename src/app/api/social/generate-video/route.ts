export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function startRunway(prompt: string, imageUrl?: string): Promise<string | null> {
  const key = process.env.RUNWAY_API_KEY
  if (!key) return null
  try {
    const endpoint = imageUrl ? 'image_to_video' : 'text_to_video'
    const body: Record<string, unknown> = imageUrl
      ? { model: 'gen4_turbo', promptImage: imageUrl, promptText: prompt.slice(0, 512), duration: 5, ratio: '1280:720' }
      : { model: 'gen4_turbo', promptText: prompt.slice(0, 512), duration: 5, ratio: '1280:720' }
    const res = await fetch(`https://api.dev.runwayml.com/v1/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('[runway] API error:', res.status, err.slice(0, 200))
      return null
    }
    const d = await res.json()
    return d.id ? `runway:${d.id}` : null
  } catch (e) {
    console.error('[runway] exception:', e)
    return null
  }
}

async function startReplicate(prompt: string): Promise<string | null> {
  const key = process.env.REPLICATE_API_KEY
  if (!key) return null
  try {
    // Using stable-video-diffusion
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'dce698e891f2ec379db3b3a2fbc0ce7a',
        input: { prompt: prompt.slice(0, 512), num_frames: 25, width: 576, height: 320 },
      }),
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.id ? `replicate:${d.id}` : null
  } catch { return null }
}

async function _POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { prompt, image_url } = await req.json() as { prompt?: string; image_url?: string }
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

    const jobId = await startRunway(prompt, image_url) ?? await startReplicate(prompt)

    if (!jobId) {
      return NextResponse.json(
        { error: 'video_generation_failed', message: 'Video generation unavailable. Check that your Runway API key is valid.' },
        { status: 200 }
      )
    }

    return NextResponse.json({ job_id: jobId, status: 'processing' })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/generate-video', _POST)
