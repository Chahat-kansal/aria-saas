export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const HF = 'https://api.higgsfield.ai'

function hfAuth() {
  // Higgsfield v2 API: Authorization header = KEY_ID:KEY_SECRET (no Bearer prefix)
  // See: github.com/higgsfield-ai/higgsfield-js
  const k = process.env.HIGGSFIELD_API_KEY ?? ''
  return k.replace(/^Bearer\s+/i, '').replace(/^Key\s+/i, '')
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('job_id')
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  try {
    const res = await fetch(`${HF}/v1/video/${jobId}`, {
      headers: { Authorization: hfAuth() },
    })
    const text = await res.text()
    if (!res.ok) {
      if (text.trim().startsWith('<')) return NextResponse.json({ status: 'IN_QUEUE' })
      return NextResponse.json({ status: 'error', error: `Higgsfield ${res.status}` })
    }
    const d = JSON.parse(text)
    const status = (d.status ?? '').toLowerCase()

    if (status === 'completed') {
      const videoUrl: string = d.video_url ?? d.url ?? d.output?.url ?? d.videos?.[0]?.url
      if (!videoUrl) return NextResponse.json({ status: 'FAILED', error: 'No video URL in result' })
      if (sessionId) {
        await supabaseAdmin.from('reel_studio_sessions').update({
          status: 'completed', video_url: videoUrl, completed_at: new Date().toISOString(),
        }).eq('id', sessionId)
      }
      return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl })
    }
    if (status === 'failed' || status === 'error' || status === 'nsfw') {
      if (sessionId) await supabaseAdmin.from('reel_studio_sessions').update({ status: 'failed' }).eq('id', sessionId)
      return NextResponse.json({ status: 'FAILED', error: d.error ?? 'Generation failed' })
    }
    return NextResponse.json({ status: 'IN_QUEUE', progress: d.progress ?? null })
  } catch (e: any) {
    return NextResponse.json({ status: 'error', error: e.message }, { status: 500 })
  }
}
