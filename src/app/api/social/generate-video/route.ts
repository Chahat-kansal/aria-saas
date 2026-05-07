export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

async function startRunway(prompt: string, imageUrl?: string): Promise<string | null> {
  const key = process.env.RUNWAY_API_KEY
  if (!key) return null
  try {
    const body: Record<string, unknown> = {
      taskType: 'gen3a_turbo',
      internal: { frameRate: 24, seed: Math.floor(Math.random() * 9999), exploreMode: false, watermark: false },
      options: {
        name: 'Aria Reel',
        seconds: 5,
        textPrompt: prompt.slice(0, 512),
        resolution: '720p',
        ...(imageUrl ? { initImage: imageUrl } : {}),
      },
    }
    const res = await fetch('https://api.runwayml.com/v1/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.id ? `runway:${d.id}` : null
  } catch { return null }
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

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { prompt, image_url } = await req.json() as { prompt?: string; image_url?: string }
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

    const jobId = await startRunway(prompt, image_url) ?? await startReplicate(prompt)

    if (!jobId) {
      return NextResponse.json(
        { error: 'No video provider configured. Add RUNWAY_API_KEY or REPLICATE_API_KEY to your environment.' },
        { status: 503 }
      )
    }

    return NextResponse.json({ job_id: jobId, status: 'processing' })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
