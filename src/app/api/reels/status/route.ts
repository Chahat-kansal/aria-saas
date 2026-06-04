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
    // fal.ai status check
    const res = await fetch(`https://queue.fal.run/fal-ai/kling-video/requests/${jobId}/status`, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
    })
    const d = await res.json()
    const status = (d.status ?? '').toUpperCase()

    if (status === 'COMPLETED') {
      // Get the actual result
      const resResult = await fetch(`https://queue.fal.run/fal-ai/kling-video/requests/${jobId}`, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
      })
      const result = await resResult.json()
      const videoUrl = result.video?.url ?? result.output?.video?.url
      if (!videoUrl) return NextResponse.json({ status: 'FAILED', error: 'No video URL' })
      if (sessionId) {
        await supabaseAdmin.from('reel_studio_sessions').update({
          status: 'completed', video_url: videoUrl, completed_at: new Date().toISOString(),
        }).eq('id', sessionId)
      }
      return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl })
    }
    if (status === 'FAILED' || status === 'ERROR') {
      if (sessionId) await supabaseAdmin.from('reel_studio_sessions').update({ status: 'failed' }).eq('id', sessionId)
      return NextResponse.json({ status: 'FAILED', error: d.error ?? 'Generation failed' })
    }
    return NextResponse.json({ status: 'IN_QUEUE', queue_position: d.queue_position })
  } catch (e: any) {
    return NextResponse.json({ status: 'error', error: e.message }, { status: 500 })
  }
}
