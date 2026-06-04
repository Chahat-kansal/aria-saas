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

  // Load the EXACT status_url and response_url fal.ai gave us at submit time.
  let statusUrl: string | null = null
  let responseUrl: string | null = null
  if (sessionId) {
    const { data: sess } = await supabaseAdmin.from('reel_studio_sessions')
      .select('fal_model, scene_image_url').eq('id', sessionId).maybeSingle()
    if (sess?.fal_model?.startsWith('https://')) statusUrl = sess.fal_model
    if (sess?.scene_image_url?.startsWith('https://queue.fal')) responseUrl = sess.scene_image_url
  }
  // Generic fallback (correct format, no model version path)
  if (!statusUrl) statusUrl = `https://queue.fal.run/fal-ai/kling-video/requests/${jobId}/status`
  if (!responseUrl) responseUrl = `https://queue.fal.run/fal-ai/kling-video/requests/${jobId}`

  try {
    const res = await fetch(statusUrl, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
      signal: AbortSignal.timeout(8000),
    })
    const text = await res.text()
    console.log('[reels/status] job:', jobId, 'http:', res.status, 'body:', text.slice(0, 200))

    if (!res.ok) return NextResponse.json({ status: 'IN_QUEUE' })

    const d = JSON.parse(text)
    const status = (d.status ?? '').toUpperCase()

    // Always trust fal.ai's own response_url if present in the status payload
    if (d.response_url && typeof d.response_url === 'string') responseUrl = d.response_url

    if (status === 'COMPLETED') {
      // Fetch the result from the EXACT response_url — NEVER manipulate the string.
      const res2 = await fetch(responseUrl!, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      const result = await res2.json()
      console.log('[reels/status] result:', JSON.stringify(result).slice(0, 400))

      const videoUrl =
        result?.video?.url ??
        result?.output?.video?.url ??
        result?.video_url ??
        result?.videos?.[0]?.url ??
        result?.output?.url ??
        (typeof result?.video === 'string' ? result.video : null) ??
        (Array.isArray(result?.output) ? result.output[0]?.url : null)

      if (!videoUrl) {
        // Result not ready yet — keep polling, don't fail.
        console.error('[reels/status] COMPLETED but no video url, result:', JSON.stringify(result).slice(0, 300))
        return NextResponse.json({ status: 'IN_QUEUE' })
      }

      if (sessionId) {
        await supabaseAdmin.from('reel_studio_sessions').update({
          status: 'completed',
          video_url: videoUrl,
          completed_at: new Date().toISOString(),
        }).eq('id', sessionId)
      }
      return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl })
    }

    if (status === 'FAILED' || status === 'ERROR') {
      if (sessionId) await supabaseAdmin.from('reel_studio_sessions')
        .update({ status: 'failed' }).eq('id', sessionId)
      return NextResponse.json({ status: 'FAILED', error: d.error ?? 'Generation failed' })
    }

    return NextResponse.json({ status: 'IN_QUEUE', queue_position: d.queue_position ?? null })
  } catch (e: any) {
    console.error('[reels/status] error:', e.message)
    return NextResponse.json({ status: 'IN_QUEUE' })
  }
}
