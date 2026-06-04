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

  // Get the exact status_url and response_url saved at submit time
  let statusUrl: string | null = null
  let responseUrl: string | null = null

  if (sessionId) {
    const { data: sess } = await supabaseAdmin.from('reel_studio_sessions')
      .select('fal_model, scene_image_url').eq('id', sessionId).maybeSingle()
    // fal_model column stores status_url, scene_image_url stores response_url
    if (sess?.fal_model?.startsWith('https://')) statusUrl = sess.fal_model
    if (sess?.scene_image_url?.startsWith('https://queue.fal')) responseUrl = sess.scene_image_url
  }

  // Fallback: build URL from job_id if not stored
  if (!statusUrl) {
    statusUrl = `https://queue.fal.run/fal-ai/kling-video/requests/${jobId}/status`
  }

  try {
    const res = await fetch(statusUrl, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
      signal: AbortSignal.timeout(8000),
    })
    const text = await res.text()
    console.log('[reels/status] job:', jobId, 'http:', res.status, 'body:', text.slice(0, 300))

    if (!res.ok) {
      // Try text-to-video endpoint as fallback
      const fallback = statusUrl.replace('image-to-video', 'text-to-video')
      const res2 = await fetch(fallback, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(8000),
      })
      const text2 = await res2.text()
      console.log('[reels/status] fallback http:', res2.status, 'body:', text2.slice(0, 300))
      if (!res2.ok) return NextResponse.json({ status: 'IN_QUEUE' })
      const d2 = JSON.parse(text2)
      responseUrl = d2.response_url ?? responseUrl
      return await handleCompleted(d2, jobId, sessionId, responseUrl, FAL_KEY, statusUrl.replace('image-to-video', 'text-to-video').replace('/status', ''))
    }

    const d = JSON.parse(text)
    const resultEndpoint = statusUrl.replace('/status', '')
    responseUrl = d.response_url ?? responseUrl
    return await handleCompleted(d, jobId, sessionId, responseUrl, FAL_KEY, resultEndpoint)

  } catch (e: any) {
    console.error('[reels/status] error:', e.message)
    return NextResponse.json({ status: 'IN_QUEUE' })
  }
}

async function handleCompleted(
  d: any, jobId: string, sessionId: string | null,
  responseUrl: string | null, falKey: string, resultEndpoint: string
): Promise<Response> {
  const status = (d.status ?? '').toUpperCase()
  console.log('[reels/status] fal status:', status)

  if (status === 'COMPLETED') {
    try {
      // Use response_url if available (returned from submit), else build from endpoint
      const fetchUrl = responseUrl ?? resultEndpoint
      console.log('[reels/status] fetching result from:', fetchUrl)
      const res = await fetch(fetchUrl, {
        headers: { 'Authorization': `Key ${falKey}` },
        signal: AbortSignal.timeout(10000),
      })
      const result = await res.json()
      console.log('[reels/status] result:', JSON.stringify(result).slice(0, 600))

      // fal.ai Kling returns the video URL in various shapes — check all known paths
      const videoUrl =
        result?.video?.url ??
        result?.output?.video?.url ??
        result?.video_url ??
        result?.videos?.[0]?.url ??
        result?.output?.url ??
        (typeof result?.video === 'string' ? result.video : null) ??
        (Array.isArray(result?.output) ? result.output[0]?.url : null)

      if (!videoUrl) {
        // Result payload may not be fully ready yet even though status says COMPLETED.
        // Keep polling (IN_QUEUE) instead of permanently failing.
        console.error('[reels/status] COMPLETED but no video url yet, full result:', JSON.stringify(result).slice(0, 600))
        return NextResponse.json({ status: 'IN_QUEUE' })
      }

      if (sessionId) {
        await supabaseAdmin.from('reel_studio_sessions').update({
          status: 'completed',
          video_url: videoUrl,
          completed_at: new Date().toISOString(),
          scene_image_url: null,
        }).eq('id', sessionId)
      }

      return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl })
    } catch (e: any) {
      console.error('[reels/status] result fetch error:', e.message)
      return NextResponse.json({ status: 'IN_QUEUE' })
    }
  }

  if (status === 'FAILED' || status === 'ERROR') {
    if (sessionId) await supabaseAdmin.from('reel_studio_sessions')
      .update({ status: 'failed' }).eq('id', sessionId)
    return NextResponse.json({ status: 'FAILED', error: d.error ?? 'Generation failed' })
  }

  return NextResponse.json({ status: 'IN_QUEUE', queue_position: d.queue_position ?? null })
}
