export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const FAL_KEY = process.env.FAL_API_KEY ?? ''
const DEFAULT_MODEL = 'fal-ai/kling-video/v2.1/pro/text-to-video'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('job_id')
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  // Get the model used for this job from DB
  let model = DEFAULT_MODEL
  if (sessionId) {
    const { data: sess } = await supabaseAdmin.from('reel_studio_sessions')
      .select('fal_model').eq('id', sessionId).maybeSingle()
    if (sess?.fal_model) model = sess.fal_model
  }

  // Try status with known model first, then fallback to other model
  const models = [model]
  if (model.includes('text-to-video')) {
    models.push('fal-ai/kling-video/v2.1/pro/image-to-video')
  } else {
    models.push('fal-ai/kling-video/v2.1/pro/text-to-video')
  }

  let statusData: any = null
  let matchedModel = ''

  for (const m of models) {
    try {
      const url = `https://queue.fal.run/${m}/requests/${jobId}/status`
      const res = await fetch(url, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(8000),
      })
      const text = await res.text()
      console.log('[reels/status]', jobId, m, res.status, text.slice(0, 200))
      if (res.ok) {
        statusData = JSON.parse(text)
        matchedModel = m
        break
      }
    } catch (e: any) {
      console.error('[reels/status] fetch error:', e.message)
    }
  }

  if (!statusData) {
    return NextResponse.json({ status: 'IN_QUEUE' })
  }

  const status = (statusData.status ?? '').toUpperCase()

  if (status === 'COMPLETED') {
    try {
      const resultUrl = `https://queue.fal.run/${matchedModel}/requests/${jobId}`
      const res2 = await fetch(resultUrl, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      const result = await res2.json()
      console.log('[reels/status] result:', JSON.stringify(result).slice(0, 300))

      const videoUrl = result?.video?.url
      if (!videoUrl) {
        console.error('[reels/status] no video.url in:', JSON.stringify(result).slice(0, 300))
        if (sessionId) await supabaseAdmin.from('reel_studio_sessions')
          .update({ status: 'failed' }).eq('id', sessionId)
        return NextResponse.json({ status: 'FAILED', error: 'No video URL in result' })
      }

      if (sessionId) {
        await supabaseAdmin.from('reel_studio_sessions').update({
          status: 'completed',
          video_url: videoUrl,
          completed_at: new Date().toISOString(),
        }).eq('id', sessionId)
      }

      return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl })
    } catch (e: any) {
      console.error('[reels/status] result error:', e.message)
      return NextResponse.json({ status: 'IN_QUEUE' })
    }
  }

  if (status === 'FAILED' || status === 'ERROR') {
    if (sessionId) await supabaseAdmin.from('reel_studio_sessions')
      .update({ status: 'failed' }).eq('id', sessionId)
    return NextResponse.json({ status: 'FAILED', error: statusData.error ?? 'Generation failed' })
  }

  return NextResponse.json({ status: 'IN_QUEUE', queue_position: statusData.queue_position ?? null })
}
