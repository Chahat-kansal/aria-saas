export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const FAL_KEY = process.env.FAL_API_KEY ?? ''
const MODELS = [
  'fal-ai/kling-video/v2.1/pro/text-to-video',
  'fal-ai/kling-video/v2.1/pro/image-to-video',
]

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('job_id')
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  // Try status endpoint for each model until we get a hit
  let statusData: any = null
  let matchedModel = ''
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://queue.fal.run/${model}/requests/${jobId}/status`,
        { headers: { 'Authorization': `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(8000) }
      )
      if (res.ok) {
        statusData = await res.json()
        matchedModel = model
        break
      }
    } catch { continue }
  }

  if (!statusData) return NextResponse.json({ status: 'IN_QUEUE' })

  const status = (statusData.status ?? '').toUpperCase()
  console.log('[reels/status] job:', jobId, 'status:', status, 'model:', matchedModel)

  if (status === 'COMPLETED') {
    try {
      // Fetch result using the matched model path
      const res = await fetch(
        `https://queue.fal.run/${matchedModel}/requests/${jobId}`,
        { headers: { 'Authorization': `Key ${FAL_KEY}` }, signal: AbortSignal.timeout(10000) }
      )
      const result = await res.json()
      console.log('[reels/status] result:', JSON.stringify(result).slice(0, 200))
      const videoUrl = result?.video?.url

      if (!videoUrl) {
        console.error('[reels/status] no video.url in result:', JSON.stringify(result).slice(0, 200))
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
    return NextResponse.json({ status: 'FAILED', error: statusData.error ?? 'Generation failed' })
  }

  return NextResponse.json({ status: 'IN_QUEUE', queue_position: statusData.queue_position ?? null })
}
