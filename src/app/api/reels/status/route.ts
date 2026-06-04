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
    // fal.ai generic status endpoint — works for any model without knowing the model path
    const res = await fetch(`https://queue.fal.run/requests/${jobId}/status`, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
      signal: AbortSignal.timeout(8000),
    })

    const text = await res.text()
    console.log('[reels/status]', jobId, res.status, text.slice(0, 300))

    if (!res.ok) {
      // 404 = job not found on fal.ai yet or expired
      return NextResponse.json({ status: 'IN_QUEUE' })
    }

    const d = JSON.parse(text)
    const status = (d.status ?? '').toUpperCase()

    if (status === 'COMPLETED') {
      // Use response_url from the status response if available, else build it
      const resultUrl = d.response_url ?? `https://queue.fal.run/requests/${jobId}/response`
      try {
        const res2 = await fetch(resultUrl, {
          headers: { 'Authorization': `Key ${FAL_KEY}` },
          signal: AbortSignal.timeout(10000),
        })
        const result = await res2.json()
        console.log('[reels/status] result keys:', Object.keys(result))
        const videoUrl = result?.video?.url ?? result?.output?.video?.url

        if (!videoUrl) {
          console.error('[reels/status] no video url:', JSON.stringify(result).slice(0, 300))
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
      } catch (e: any) {
        console.error('[reels/status] result fetch failed:', e.message)
        return NextResponse.json({ status: 'IN_QUEUE' })
      }
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
