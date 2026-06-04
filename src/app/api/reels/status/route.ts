export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PROXY = `${SUPABASE_URL}/functions/v1/higgsfield-proxy`

async function callHF(endpoint: string) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, method: 'GET' }),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Higgsfield ${res.status}: ${text.slice(0, 100)}`)
  return JSON.parse(text)
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('job_id')
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  try {
    const d = await callHF(`/v1/video/${jobId}`)
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
