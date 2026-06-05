export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// NOTE: Full platform posting (Instagram Graph API, TikTok Content API, Facebook Graph API,
// YouTube Data API) requires OAuth tokens per platform — a separate sprint.
// This route QUEUES the publish intent only. No social APIs are called here.
// The platform OAuth + actual posting is handled when tokens exist (see Aria Settings → Socials).

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id?: string
    video_url?: string
    caption?: string
    platforms?: string[]
    scheduled_at?: string
  }

  const { business_id, video_url, caption, platforms, scheduled_at } = body

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (!video_url) return NextResponse.json({ error: 'video_url required' }, { status: 400 })
  if (!platforms || platforms.length === 0) {
    return NextResponse.json({ error: 'platforms required' }, { status: 400 })
  }

  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('reel_publish_jobs')
    .insert({
      business_id,
      video_url,
      caption: caption ?? '',
      platforms,
      scheduled_at: scheduled_at ?? null,
      status: 'queued',
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Failed to queue publish job' }, { status: 500 })
  }

  return NextResponse.json({ job_id: job.id, status: 'queued' })
}

export const POST = withErrorCapture('reels/publish-social', _POST)
