export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

// NOTE (2026-06-05): fal.ai endpoint IDs — verify against https://fal.ai/models before production use.
// bg-remove: fal-ai/bria/video/background-removal (Bria AI video bg removal — stable)
// restyle:   fal-ai/kling-video/v1/standard/video-to-video — flagged for verification.
//   If this endpoint returns 404, try v1.5 or v2: fal-ai/kling-video/v1.5/standard/video-to-video
const FAL_BG_MODEL   = 'fal-ai/bria/video/background-removal'
const FAL_V2V_MODEL  = 'fal-ai/kling-video/v1/standard/video-to-video'

async function falQueueSubmit(model: string, input: Record<string, unknown>): Promise<string> {
  const res = await fetch('https://queue.fal.run/' + model, {
    method: 'POST',
    headers: {
      Authorization: 'Key ' + FAL_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error('fal submit ' + res.status + ': ' + JSON.stringify(data).slice(0, 200))
  const requestId = (data.request_id ?? data.id) as string | undefined
  if (!requestId) throw new Error('fal returned no request_id: ' + JSON.stringify(data).slice(0, 200))
  return requestId
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id?: string
    session_id?: string
    video_url?: string
    op?: string
    confirm?: boolean
    style_prompt?: string
    background_color?: string
  }

  const { business_id, session_id, video_url, op, confirm, style_prompt, background_color } = body

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (!video_url) return NextResponse.json({ error: 'video_url required' }, { status: 400 })
  if (op !== 'restyle' && op !== 'bg-remove') {
    return NextResponse.json({ error: "op must be 'restyle' or 'bg-remove'" }, { status: 400 })
  }

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!FAL_KEY) return NextResponse.json({ error: 'FAL_API_KEY not configured' }, { status: 503 })

  // CRITICAL: never call fal without explicit confirm from the UI
  if (confirm !== true) {
    return NextResponse.json({
      needs_confirm: true,
      estimated_cost_aud: op === 'restyle' ? 0.95 : 0.21,
    })
  }

  const estimatedCost = op === 'restyle' ? 0.95 : 0.21

  // Create job row first — webhook matches on fal_job_id → job.id
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('reel_v2v_jobs')
    .insert({
      business_id,
      session_id: session_id ?? '',
      op,
      status: 'processing',
      estimated_cost_aud: estimatedCost,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Failed to create job record' }, { status: 500 })
  }

  // Submit to fal queue — both ops are async (bg-remove can take 20–40s)
  let falJobId: string
  try {
    if (op === 'bg-remove') {
      falJobId = await falQueueSubmit(FAL_BG_MODEL, {
        video_url,
        background_color: background_color ?? 'Transparent',
        preserve_audio: true,
      })
    } else {
      falJobId = await falQueueSubmit(FAL_V2V_MODEL, {
        video_url,
        prompt: style_prompt ?? 'Cinematic restyle with rich colours, film grain, and dramatic lighting',
        duration: '5',
        aspect_ratio: '9:16',
      })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'fal submission failed'
    await supabaseAdmin.from('reel_v2v_jobs').update({ status: 'error' }).eq('id', job.id)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Persist fal request_id so the webhook can look up this job
  await supabaseAdmin.from('reel_v2v_jobs')
    .update({ fal_job_id: falJobId })
    .eq('id', job.id)

  return NextResponse.json({ job_id: job.id, status: 'processing' })
}

export const POST = withErrorCapture('reels/v2v', _POST)
