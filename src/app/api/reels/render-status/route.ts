export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sandboxId = url.searchParams.get('sandboxId')
  const cmdId     = url.searchParams.get('cmdId')
  const sessionId = url.searchParams.get('session_id')

  if (!sandboxId || !cmdId || !sessionId) {
    return NextResponse.json({ error: 'sandboxId, cmdId, session_id required' }, { status: 400 })
  }

  // Ownership check via session
  const { data: sess } = await supabaseAdmin.from('reel_studio_sessions')
    .select('id, business_id, edited_video_url')
    .eq('id', sessionId).maybeSingle()
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', sess.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Already done — short-circuit
  if (sess.edited_video_url) {
    return NextResponse.json({ stage: 'done', url: sess.edited_video_url, progress: 1 })
  }

  const { getRenderProgress } = await import('@remotion/vercel')
  const progress = await getRenderProgress({ sandboxId, cmdId })

  if (progress.stage === 'done') {
    await supabaseAdmin.from('reel_studio_sessions').update({
      edited_video_url: progress.url,
      status: 'completed',
    }).eq('id', sessionId)

    // Log to autopilot actions (non-fatal)
    try {
      await supabaseAdmin.from('aria_autopilot_actions').insert({
        business_id: sess.business_id,
        category: 'content',
        priority: 'routine',
        title: 'Reel exported as MP4',
        description: 'Professional edit exported via Remotion. Ready to publish.',
        status: 'executed',
        action_data: { session_id: sessionId, url: progress.url },
      })
    } catch { /* non-fatal */ }

    return NextResponse.json({ stage: 'done', url: progress.url, progress: 1 })
  }

  if (progress.stage === 'error') {
    return NextResponse.json({
      stage: 'error',
      error: (progress as { stage: 'error'; message: string }).message,
      progress: 0,
    })
  }

  if (progress.stage === 'expired') {
    return NextResponse.json({ stage: 'expired', error: 'Render job expired', progress: 0 })
  }

  // In-progress — return overall progress
  const pct = 'overallProgress' in progress ? (progress as { overallProgress: number }).overallProgress : 0
  return NextResponse.json({ stage: progress.stage, progress: pct })
}

export const GET = withErrorCapture('reels/render-status', _GET)
