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

  try {
    // fal.ai queue status — works for any model
    const res = await fetch(`https://queue.fal.run/fal-ai/kling-video/v1.6/pro/text-to-video/requests/${jobId}/status`, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      // Try image-to-video endpoint if text-to-video status 404s
      const res2 = await fetch(`https://queue.fal.run/fal-ai/kling-video/v1.6/pro/image-to-video/requests/${jobId}/status`, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res2.ok) return NextResponse.json({ status: 'IN_QUEUE' })
      const d2 = await res2.json()
      return handleStatus(d2, jobId, sessionId, 'image-to-video')
    }
    const d = await res.json()
    return handleStatus(d, jobId, sessionId, 'text-to-video')
  } catch (e: any) {
    return NextResponse.json({ status: 'IN_QUEUE' })
  }
}

async function handleStatus(d: any, jobId: string, sessionId: string | null, variant: string) {
  const status = (d.status ?? '').toUpperCase()
  if (status === 'COMPLETED') {
    // Get result
    try {
      const res = await fetch(`https://queue.fal.run/fal-ai/kling-video/v1.6/pro/${variant}/requests/${jobId}`, {
        headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      const result = await res.json()
      const videoUrl = result.video?.url ?? result.video_url ?? result.output?.video?.url
      if (!videoUrl) return NextResponse.json({ status: 'IN_QUEUE' })
      if (sessionId) {
        await supabaseAdmin.from('reel_studio_sessions').update({
          status: 'completed', video_url: videoUrl, completed_at: new Date().toISOString(),
        }).eq('id', sessionId)
      }
      return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl })
    } catch {
      return NextResponse.json({ status: 'IN_QUEUE' })
    }
  }
  if (status === 'FAILED' || status === 'ERROR') {
    if (sessionId) await supabaseAdmin.from('reel_studio_sessions').update({ status: 'failed' }).eq('id', sessionId)
    return NextResponse.json({ status: 'FAILED', error: d.error ?? 'Generation failed' })
  }
  return NextResponse.json({ status: 'IN_QUEUE', queue_position: d.queue_position ?? null })
}
