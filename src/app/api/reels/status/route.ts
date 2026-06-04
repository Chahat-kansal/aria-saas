export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('job_id')
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  // Get session to find the response_url we stored at submit time
  let responseUrl: string | null = null
  if (sessionId) {
    const { data: session } = await supabaseAdmin.from('reel_studio_sessions')
      .select('scene_image_url').eq('id', sessionId).maybeSingle()
    responseUrl = session?.scene_image_url ?? null
  }

  // Build status URL — fal.ai uses the model path for status checks
  // Try both t2v and i2v models since we don't store which was used
  const models = [
    'fal-ai/kling-video/v2.1/pro/text-to-video',
    'fal-ai/kling-video/v2.1/pro/image-to-video',
  ]

  let statusData: any = null
  for (const model of models) {
    try {
      const res = await fetch(
        `https://queue.fal.run/${model}/requests/${jobId}/status`,
        { headers: { 'Authorization': `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(8000) }
      )
      if (res.ok) { statusData = await res.json(); break }
    } catch { continue }
  }

  if (!statusData) return NextResponse.json({ status: 'IN_QUEUE' })

  const status = (statusData.status ?? '').toUpperCase()

  if (status === 'COMPLETED') {
    // Fetch result from response_url or build it
    const resultUrl = responseUrl ??
      `https://queue.fal.run/fal-ai/kling-video/v2.1/pro/text-to-video/requests/${jobId}`

    try {
      const res = await fetch(resultUrl, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      const result = await res.json()
      const videoUrl = result?.video?.url

      if (!videoUrl) return NextResponse.json({ status: 'IN_QUEUE' })

      if (sessionId) {
        await supabaseAdmin.from('reel_studio_sessions').update({
          status: 'completed',
          video_url: videoUrl,
          completed_at: new Date().toISOString(),
          scene_image_url: null, // clear temp storage
        }).eq('id', sessionId)
      }

      return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl })
    } catch {
      return NextResponse.json({ status: 'IN_QUEUE' })
    }
  }

  if (status === 'FAILED' || status === 'ERROR') {
    if (sessionId) await supabaseAdmin.from('reel_studio_sessions')
      .update({ status: 'failed' }).eq('id', sessionId)
    return NextResponse.json({ status: 'FAILED', error: statusData.error ?? 'Generation failed' })
  }

  return NextResponse.json({
    status: 'IN_QUEUE',
    queue_position: statusData.queue_position ?? null,
  })
}
