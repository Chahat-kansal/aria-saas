export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const FAL_KEY = process.env.FAL_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('s')
  if (secret !== 'ariafix9') return NextResponse.json({ error: 'no' }, { status: 403 })

  const { data: jobs } = await supabaseAdmin.from('reel_studio_sessions')
    .select('id, higgsfield_job_id, scene_image_url')
    .eq('status', 'processing')
    .not('higgsfield_job_id', 'is', null)
    .limit(20)

  const results: any[] = []
  for (const j of jobs ?? []) {
    const responseUrl = (j.scene_image_url?.startsWith('https://queue.fal'))
      ? j.scene_image_url
      : `https://queue.fal.run/fal-ai/kling-video/requests/${j.higgsfield_job_id}`
    try {
      const r = await fetch(responseUrl, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
        signal: AbortSignal.timeout(12000),
      })
      const result = await r.json()
      const videoUrl =
        result?.video?.url ?? result?.output?.video?.url ?? result?.video_url ??
        result?.videos?.[0]?.url ?? result?.output?.url ?? null
      if (videoUrl) {
        await supabaseAdmin.from('reel_studio_sessions').update({
          status: 'completed', video_url: videoUrl, completed_at: new Date().toISOString(),
        }).eq('id', j.id)
        results.push({ id: j.id, recovered: true, videoUrl })
      } else {
        results.push({ id: j.id, recovered: false, sample: JSON.stringify(result).slice(0, 150) })
      }
    } catch (e: any) {
      results.push({ id: j.id, error: e.message })
    }
  }
  return NextResponse.json({ count: results.length, results })
}
