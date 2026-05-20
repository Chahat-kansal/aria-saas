export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type VideoResult = { status: 'processing' | 'completed' | 'failed' | 'error'; url?: string; error?: string }

async function checkRunway(id: string): Promise<VideoResult> {
  const key = process.env.RUNWAY_API_KEY
  if (!key) return { status: 'error', error: 'RUNWAY_API_KEY not configured' }
  try {
    const res = await fetch(`https://api.dev.runwayml.com/v1/tasks/${id}`, {
      headers: { Authorization: `Bearer ${key}`, 'X-Runway-Version': '2024-11-06' },
    })
    const d = await res.json()
    if (d.status === 'SUCCEEDED') return { status: 'completed', url: d.output?.[0] }
    if (d.status === 'FAILED') return { status: 'failed', error: d.failure ?? 'Generation failed' }
    return { status: 'processing' }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

async function checkReplicate(id: string): Promise<VideoResult> {
  const key = process.env.REPLICATE_API_KEY
  if (!key) return { status: 'error', error: 'REPLICATE_API_KEY not configured' }
  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Token ${key}` },
    })
    const d = await res.json()
    if (d.status === 'succeeded') return { status: 'completed', url: Array.isArray(d.output) ? d.output[0] : d.output }
    if (d.status === 'failed') return { status: 'failed', error: d.error ?? 'Generation failed' }
    return { status: 'processing' }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

async function _GET(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const jobId = new URL(req.url).searchParams.get('job_id')
    if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

    const sep = jobId.indexOf(':')
    if (sep < 0) return NextResponse.json({ error: 'Invalid job_id format (expected provider:id)' }, { status: 400 })
    const provider = jobId.slice(0, sep)
    const id = jobId.slice(sep + 1)

    if (provider === 'runway') return NextResponse.json(await checkRunway(id))
    if (provider === 'replicate') return NextResponse.json(await checkReplicate(id))
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

export const GET = withErrorCapture('social/video-status', _GET)
