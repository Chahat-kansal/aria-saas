export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Veo model. Cost-optimized default. Swap to 'veo-3.1-generate-preview' for the
// higher-quality, more expensive tier. When Gemini Omni Flash's developer API
// ships (announced Google I/O 2026), swap this to the Omni model id.
const VEO_MODEL = 'veo-3.1-fast-generate-preview'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { prompt?: string; image_url?: string }
  if (!body.prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return NextResponse.json({
      error: 'video_generation_failed',
      message: 'Veo video requires the Gemini API paid tier — enable billing on your Google AI key.',
    })
  }

  const instance: Record<string, unknown> = { prompt: body.prompt }
  if (body.image_url) {
    try {
      const imgRes = await fetch(body.image_url)
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer()
        const b64 = Buffer.from(buf).toString('base64')
        const ct = imgRes.headers.get('content-type') ?? 'image/png'
        // Veo predictLongRunning expects bytesBase64Encoded, NOT inlineData
        // (inlineData is the Gemini chat-API format and is rejected by Veo).
        instance.image = { bytesBase64Encoded: b64, mimeType: ct }
      }
    } catch { /* non-fatal — proceed as text-to-video */ }
  }

  const res = await fetch(GEMINI_BASE + '/models/' + VEO_MODEL + ':predictLongRunning', {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [instance],
      parameters: {
        aspectRatio: '9:16',
        resolution: '720p',
        durationSeconds: '8',
        // Image-to-video only permits 'allow_adult'; safe for text-to-video too.
        personGeneration: body.image_url ? 'allow_adult' : 'allow_all',
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    let message = 'Veo API error ' + res.status
    if (res.status === 403) {
      message = 'Veo access denied — enable billing on your Google AI project and request Veo API access.'
    } else if (errText) {
      try { const e = JSON.parse(errText); message = (e.error?.message as string) ?? message } catch { /* ok */ }
    }
    return NextResponse.json({ error: 'video_generation_failed', message })
  }

  const data = await res.json() as { name?: string }
  if (!data.name) {
    return NextResponse.json({ error: 'video_generation_failed', message: 'No job ID returned from Veo.' })
  }
  return NextResponse.json({ job_id: data.name, status: 'processing' })
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = new URL(req.url).searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ status: 'error', error: 'API key not configured' })

  try {
    const res = await fetch(GEMINI_BASE + '/' + jobId, {
      headers: { 'x-goog-api-key': key },
    })
    if (!res.ok) return NextResponse.json({ status: 'error', error: 'Poll failed: ' + res.status })

    const data = await res.json() as {
      done?: boolean
      error?: { message?: string }
      response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } }
    }

    if (!data.done) return NextResponse.json({ status: 'processing' })
    if (data.error) return NextResponse.json({ status: 'failed', error: data.error.message ?? 'Generation failed' })

    const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
    if (!videoUri) return NextResponse.json({ status: 'failed', error: 'No video URI in response' })

    // Video URI requires x-goog-api-key to download — fetch server-side and re-upload to Vercel Blob
    const videoRes = await fetch(videoUri, { headers: { 'x-goog-api-key': key } })
    if (!videoRes.ok) return NextResponse.json({ status: 'error', error: 'Could not download video from Veo' })

    const videoBuffer = await videoRes.arrayBuffer()
    const { put } = await import('@vercel/blob')
    const blob = await put('aria-studio/veo-' + Date.now() + '.mp4', Buffer.from(videoBuffer), {
      access: 'public',
      contentType: 'video/mp4',
    })
    return NextResponse.json({ status: 'completed', url: blob.url })
  } catch (e) {
    return NextResponse.json({ status: 'error', error: (e as Error).message ?? 'Unknown error' })
  }
}

export const GET = withErrorCapture('studio/generate-video', _GET)
export const POST = withErrorCapture('studio/generate-video', _POST)
