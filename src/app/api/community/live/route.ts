export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? ''
const CF_TOKEN   = process.env.CLOUDFLARE_STREAM_API_TOKEN ?? ''

async function getAuthBiz(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('businesses').select('id,name').eq('user_id', user.id).eq('is_active', true).limit(1).single()
  return data ? { user, biz: data as { id: string; name: string } } : null
}

// POST — create live stream
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const auth = await getAuthBiz(supabase)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CF_ACCOUNT || !CF_TOKEN) {
    return NextResponse.json({ error: 'Cloudflare Stream not configured' }, { status: 503 })
  }

  const body = await req.json() as { title?: string }
  const title = body.title ?? auth.biz.name + ' Live'

  // Create Cloudflare live input — EPHEMERAL, no recording ever
  const cfRes = await fetch(
    'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT + '/stream/live_inputs',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + CF_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: { name: 'aria-live-' + auth.biz.id + '-' + Date.now() },
        recording: { mode: 'off' },
        deleteRecordingAfterDays: 0,
      }),
    }
  )
  if (!cfRes.ok) {
    const err = await cfRes.text()
    return NextResponse.json({ error: 'Cloudflare error: ' + err }, { status: 502 })
  }

  type CfResult = {
    result: {
      uid: string
      webRTC: { url: string }
      playback: { hls: string; dash: string }
    }
  }
  const cfData = await cfRes.json() as CfResult
  const { uid: cfUid, webRTC, playback } = cfData.result

  // Insert community post (post_type='live')
  const { data: post, error: postErr } = await supabaseAdmin.from('community_posts').insert({
    business_id: auth.biz.id,
    post_type: 'live',
    title,
    body: title,
    media_urls: [playback.hls],
    media_type: 'live',
    status: 'published',
    published_at: new Date().toISOString(),
    ai_generated: false,
  }).select('id').single()

  if (postErr) return NextResponse.json({ error: postErr.message }, { status: 500 })

  // Insert live stream record
  const { data: stream, error: streamErr } = await supabaseAdmin.from('community_live_streams').insert({
    business_id: auth.biz.id,
    cf_stream_uid: cfUid,
    cf_playback_hls: playback.hls,
    cf_whip_url: webRTC.url,
    status: 'active',
    title,
    community_post_id: post.id,
  }).select('id').single()

  if (streamErr) return NextResponse.json({ error: streamErr.message }, { status: 500 })

  return NextResponse.json({
    stream_id: (stream as { id: string }).id,
    whip_url: webRTC.url,
    playback_hls: playback.hls,
    post_id: post.id,
  }, { status: 201 })
}

// DELETE — end live stream
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const auth = await getAuthBiz(supabase)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const streamId = searchParams.get('stream_id')
  if (!streamId) return NextResponse.json({ error: 'stream_id required' }, { status: 400 })

  const { data: stream } = await supabaseAdmin.from('community_live_streams')
    .select('id,cf_stream_uid,community_post_id,business_id')
    .eq('id', streamId)
    .eq('business_id', auth.biz.id)
    .maybeSingle()
  if (!stream) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const s = stream as { id: string; cf_stream_uid: string; community_post_id: string | null; business_id: string }

  // Delete from Cloudflare (ephemeral — gone forever)
  if (CF_ACCOUNT && CF_TOKEN) {
    await fetch(
      'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT + '/stream/live_inputs/' + s.cf_stream_uid,
      { method: 'DELETE', headers: { Authorization: 'Bearer ' + CF_TOKEN } }
    ).catch(() => {})
  }

  const now = new Date().toISOString()
  await supabaseAdmin.from('community_live_streams')
    .update({ status: 'ended', ended_at: now })
    .eq('id', streamId)

  if (s.community_post_id) {
    await supabaseAdmin.from('community_posts')
      .update({ status: 'ended' })
      .eq('id', s.community_post_id)
  }

  return NextResponse.json({ ok: true })
}

// GET — list active streams
async function _GET() {
  const { data } = await supabaseAdmin.from('community_live_streams')
    .select('id,title,started_at,viewer_count,business_id,cf_playback_hls,businesses(name,logo_url)')
    .eq('status', 'active')
    .order('started_at', { ascending: false })
  return NextResponse.json({ streams: data ?? [] })
}

export const POST   = withErrorCapture('community/live POST',   _POST)
export const DELETE = withErrorCapture('community/live DELETE', _DELETE)
export const GET    = withErrorCapture('community/live GET',    _GET)
