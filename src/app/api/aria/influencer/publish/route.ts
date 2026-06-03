export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

/**
 * POST /api/aria/influencer/publish
 * Publishes an approved aria_influencer_post as a Reel to the @ariaos.au Instagram page.
 * Uses the AriaOS page access token stored in aria_influencer_config.
 *
 * Instagram Reels API flow:
 * 1. POST /media (media_type=REELS, video_url, caption)
 * 2. Poll /media/{id}?fields=status_code until FINISHED
 * 3. POST /media_publish (creation_id)
 */
async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { post_id } = await req.json()
  if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 })

  const { data: post } = await supabaseAdmin.from('aria_influencer_posts')
    .select('*').eq('id', post_id).maybeSingle()
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.status === 'published') return NextResponse.json({ error: 'Already published' }, { status: 400 })
  if (post.status !== 'approved') return NextResponse.json({ error: 'Post must be approved first' }, { status: 400 })
  if (!post.video_url) return NextResponse.json({ error: 'No video_url on post' }, { status: 400 })

  const { data: config } = await supabaseAdmin.from('aria_influencer_config')
    .select('*').eq('is_active', true).limit(1).maybeSingle()
  if (!config?.ariaos_instagram_account_id || !config?.ariaos_page_access_token) {
    return NextResponse.json({
      error: 'AriaOS Instagram not connected. Add ariaos_instagram_account_id and ariaos_page_access_token to aria_influencer_config.'
    }, { status: 400 })
  }

  const fullCaption = post.caption + (post.hashtags?.length
    ? '\n\n' + (post.hashtags as string[]).map((h: string) => `#${h}`).join(' ')
    : '')

  // Step 1 — Create Reels container
  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${config.ariaos_instagram_account_id}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: post.video_url,
        caption: fullCaption,
        share_to_feed: true,
        access_token: config.ariaos_page_access_token,
      }),
    }
  )
  const { id: creationId, error: cErr } = await containerRes.json()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Step 2 — Poll until video is processed (FINISHED)
  let ready = false
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const statusRes = await fetch(
      `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${config.ariaos_page_access_token}`
    )
    const { status_code } = await statusRes.json()
    if (status_code === 'FINISHED') { ready = true; break }
    if (status_code === 'ERROR') return NextResponse.json({ error: 'Video processing failed on Instagram' }, { status: 500 })
  }
  if (!ready) return NextResponse.json({ error: 'Instagram container timed out after 60s' }, { status: 504 })

  // Step 3 — Publish
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${config.ariaos_instagram_account_id}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: config.ariaos_page_access_token }),
    }
  )
  const pubData = await publishRes.json()
  if (pubData.error) return NextResponse.json({ error: pubData.error.message }, { status: 500 })

  // Mark as published
  await supabaseAdmin.from('aria_influencer_posts')
    .update({ status: 'published', instagram_post_id: pubData.id, published_at: new Date().toISOString() })
    .eq('id', post_id)

  return NextResponse.json({ ok: true, instagram_post_id: pubData.id })
}

export const POST = withErrorCapture('aria/influencer/publish', _POST)
