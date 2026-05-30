export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single()
  return !!data
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id: string
    post_type: 'update' | 'offer' | 'reel' | 'tip'
    title?: string
    body?: string
    media_url?: string
    thumbnail_url?: string
    is_story?: boolean
    scheduled_for?: string
  }

  const { business_id, post_type, title, media_url, thumbnail_url, is_story, scheduled_for } = body
  const bodyText = body.body

  if (!business_id || !post_type || !bodyText) {
    return NextResponse.json({ error: 'business_id, post_type, body required' }, { status: 400 })
  }
  if (!await verifyBiz(supabase, user.id, business_id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const mediaUrls = [media_url, thumbnail_url].filter(Boolean) as string[]
  const isReel = post_type === 'reel' || (media_url && media_url.includes('b-cdn.net'))
  const mediaType = isReel ? 'reel' : (media_url ? 'image' : null)
  const now = new Date().toISOString()
  const status = scheduled_for ? 'scheduled' : 'published'
  const publishedAt = scheduled_for ?? now
  const expiresAt = is_story ? new Date(Date.now() + 86400000).toISOString() : null

  const { data, error } = await supabaseAdmin.from('community_posts').insert({
    business_id,
    post_type,
    title: title ?? null,
    body: bodyText,
    media_urls: mediaUrls.length > 0 ? mediaUrls : [],
    media_type: mediaType,
    is_story: !!is_story,
    expires_at: expiresAt,
    scheduled_for: scheduled_for ?? null,
    status,
    published_at: publishedAt,
    ai_generated: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data }, { status: 201 })
}

export const POST = withErrorCapture('community/posts', _POST)
