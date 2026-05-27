export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const VALID_TYPES = new Set(['update', 'offer', 'new_stock', 'event', 'reel', 'video', 'story'])
const VALID_MEDIA = new Set(['image', 'video', 'reel'])
const VALID_STATUS = new Set(['draft', 'scheduled', 'published', 'archived'])
const STORY_TTL_HOURS = 24

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

interface PostPayload {
  id?: string
  post_type?: string
  title?: string | null
  body?: string | null
  media_urls?: string[]
  media_type?: string | null
  is_story?: boolean
  scheduled_for?: string | null
  status?: string
  ai_generated?: boolean
}

function sanitizeForInsert(input: PostPayload, businessId: string): Record<string, unknown> {
  const postType = input.post_type && VALID_TYPES.has(input.post_type) ? input.post_type : 'update'
  const mediaType = input.media_type && VALID_MEDIA.has(input.media_type) ? input.media_type : null
  const isStory = postType === 'story' || input.is_story === true
  const status = input.status && VALID_STATUS.has(input.status) ? input.status : 'draft'

  const now = new Date()
  let publishedAt: string | null = null
  let expiresAt: string | null = null
  if (status === 'published') {
    publishedAt = now.toISOString()
    if (isStory) expiresAt = new Date(now.getTime() + STORY_TTL_HOURS * 3600 * 1000).toISOString()
  }

  return {
    business_id: businessId,
    post_type: postType,
    title: input.title ? String(input.title).slice(0, 200) : null,
    body: input.body ? String(input.body).slice(0, 4000) : null,
    media_urls: Array.isArray(input.media_urls) ? input.media_urls.slice(0, 10) : [],
    media_type: mediaType,
    is_story: isStory,
    scheduled_for: status === 'scheduled' && input.scheduled_for ? input.scheduled_for : null,
    published_at: publishedAt,
    expires_at: expiresAt,
    status,
    ai_generated: !!input.ai_generated,
    updated_at: now.toISOString(),
  }
}

// GET — list this business's posts (drafts, scheduled, published, archived). Optional ?status= filter.
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let q = supabaseAdmin.from('community_posts')
    .select('id, post_type, title, body, media_urls, media_type, is_story, expires_at, ai_generated, scheduled_for, published_at, status, created_at, updated_at')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && VALID_STATUS.has(status)) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark expired stories so the UI can show them greyed out
  const now = Date.now()
  const posts = (data ?? []).map(p => ({
    ...p,
    is_expired: p.is_story && p.expires_at ? new Date(p.expires_at).getTime() < now : false,
  }))
  return NextResponse.json({ posts })
}

// POST — create a new post (draft / scheduled / published)
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as PostPayload
  if (!body.title && !body.body && !(Array.isArray(body.media_urls) && body.media_urls.length > 0)) {
    return NextResponse.json({ error: 'A post needs at least a title, body, or one media item.' }, { status: 400 })
  }
  if (body.media_type === 'reel' && !(Array.isArray(body.media_urls) && body.media_urls.length > 0)) {
    return NextResponse.json({ error: 'Reels require a video.' }, { status: 400 })
  }

  const row = sanitizeForInsert(body, bid)
  const { data, error } = await supabaseAdmin.from('community_posts').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}

// PATCH — update or change status of an existing post
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as PostPayload
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('community_posts')
    .select('id, post_type, is_story, status, published_at, expires_at')
    .eq('id', body.id).eq('business_id', bid).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Build a partial patch from only the provided fields
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.post_type !== undefined && VALID_TYPES.has(body.post_type)) patch.post_type = body.post_type
  if (body.title !== undefined) patch.title = body.title ? String(body.title).slice(0, 200) : null
  if (body.body !== undefined) patch.body = body.body ? String(body.body).slice(0, 4000) : null
  if (body.media_urls !== undefined) patch.media_urls = Array.isArray(body.media_urls) ? body.media_urls.slice(0, 10) : []
  if (body.media_type !== undefined) patch.media_type = body.media_type && VALID_MEDIA.has(body.media_type) ? body.media_type : null
  if (body.is_story !== undefined) patch.is_story = !!body.is_story
  if (body.scheduled_for !== undefined) patch.scheduled_for = body.scheduled_for

  if (body.status !== undefined && VALID_STATUS.has(body.status)) {
    patch.status = body.status
    const now = new Date()
    if (body.status === 'published') {
      // Set published_at if not already; refresh expires_at for stories
      patch.published_at = existing.published_at ?? now.toISOString()
      const willBeStory = (patch.is_story ?? existing.is_story) === true
      if (willBeStory) patch.expires_at = new Date(now.getTime() + STORY_TTL_HOURS * 3600 * 1000).toISOString()
    } else if (body.status === 'draft' || body.status === 'archived' || body.status === 'scheduled') {
      // Unpublishing clears the published timestamp so it stops appearing in feeds
      if (body.status !== 'scheduled') patch.published_at = null
    }
  }

  const { error } = await supabaseAdmin.from('community_posts').update(patch).eq('id', body.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove a post
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabaseAdmin.from('community_posts').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('community/owner/posts', _GET)
export const POST   = withErrorCapture('community/owner/posts', _POST)
export const PATCH  = withErrorCapture('community/owner/posts', _PATCH)
export const DELETE = withErrorCapture('community/owner/posts', _DELETE)
