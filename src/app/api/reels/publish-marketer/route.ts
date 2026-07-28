export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { createDecision } from '@/lib/decisions/createDecision'

// Queues a reel for Aria Marketer by writing to aria_autopilot_actions.
// aria_autopilot_actions columns (verified from migration 20260508000000_complete_features.sql):
//   id, business_id, category, priority, title, description, action_data, estimated_impact,
//   status, approved_at, executed_at, created_at
// NOTE: table uses `category` (not `action_type`) — do NOT add action_type.

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id?: string
    session_id?: string
    video_url?: string
    caption?: string
    best_time_suggestion?: string
  }

  const { business_id, session_id, video_url, caption, best_time_suggestion } = body

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (!video_url) return NextResponse.json({ error: 'video_url required' }, { status: 400 })

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id, name')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // SPINE-1 — identical row, now also emitting the 'proposed' moat event + real-time push.
  const actionId = await createDecision({
    business_id,
    domain: 'growth',
    kind: 'reel_publish',
    category: 'reel_publish',
    priority: 'routine',
    title: 'Publish reel to social',
    subtitle: 'Reel exported and ready to publish' + (best_time_suggestion ? ' — suggested time: ' + best_time_suggestion : ''),
    payload: {
      video_url,
      caption: caption ?? '',
      session_id: session_id ?? null,
      best_time_suggestion: best_time_suggestion ?? null,
    },
    estimated_impact: 'Increases reach and engagement',
  })

  if (!actionId) {
    return NextResponse.json({ error: 'Failed to queue for Aria Marketer' }, { status: 500 })
  }

  return NextResponse.json({ status: 'queued', scheduled_for: best_time_suggestion ?? null })
}

export const POST = withErrorCapture('reels/publish-marketer', _POST)
