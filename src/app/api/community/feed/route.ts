export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'

// Public — returns posts for the customer feed.
// If the visitor has joined and follows businesses, we filter to those (and respect is_hidden).
// If not joined, we return a discovery feed of recent posts across all businesses.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(50, Math.max(5, parseInt(searchParams.get('limit') ?? '20')))
    const before = searchParams.get('before') // ISO timestamp for paging

    const member = await getCommunityMember()

    // Determine the business set
    let businessIds: string[] | null = null
    let memberFollowMap: Record<string, { is_hidden: boolean }> = {}
    if (member) {
      const { data: follows } = await supabaseAdmin
        .from('community_follows')
        .select('business_id, is_hidden')
        .eq('member_id', member.id)
        .is('unfollowed_at', null)
      const list = (follows ?? []) as Array<{ business_id: string; is_hidden: boolean }>
      memberFollowMap = Object.fromEntries(list.map(f => [f.business_id, { is_hidden: f.is_hidden }]))
      businessIds = list.filter(f => !f.is_hidden).map(f => f.business_id)
    }

    // Posts query — published, not stories (stories are separate), not expired
    let q = supabaseAdmin.from('community_posts')
      .select('id, business_id, post_type, title, body, media_urls, media_type, ai_generated, published_at, businesses(name, logo_url, industry, suburb, city, community_verified)')
      .eq('status', 'published')
      .eq('is_story', false)
      .order('published_at', { ascending: false })
      .limit(limit + 1) // +1 to detect next page

    // Always show all posts (discovery feed).
    // Followed businesses are surfaced at the top via client-side sort.
    // Never filter to followed-only — that would hide the rest of the community.
    if (before) {
      q = q.lt('published_at', before)
    }

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const list = (rows ?? []) as unknown as Array<{
      id: string; business_id: string; post_type: string; title: string | null; body: string | null
      media_urls: string[]; media_type: string | null; ai_generated: boolean; published_at: string
      businesses: { name: string | null; logo_url: string | null; industry: string | null; suburb: string | null; city: string | null; community_verified: boolean | null } | null
    }>
    const hasMore = list.length > limit
    const slice = hasMore ? list.slice(0, limit) : list

    // Engagement counts for these posts
    const postIds = slice.map(p => p.id)
    let counts: Record<string, { like: number; comment: number; save: number }> = {}
    let mineMap: Record<string, { liked: boolean; saved: boolean }> = {}
    if (postIds.length > 0) {
      const { data: engs } = await supabaseAdmin.from('community_post_engagement')
        .select('post_id, engagement_type, member_id').in('post_id', postIds)
      type Eng = { post_id: string; engagement_type: string; member_id: string | null }
      for (const e of (engs ?? []) as Eng[]) {
        if (!e.post_id) continue
        counts[e.post_id] = counts[e.post_id] ?? { like: 0, comment: 0, save: 0 }
        if (e.engagement_type === 'like' || e.engagement_type === 'comment' || e.engagement_type === 'save') {
          counts[e.post_id][e.engagement_type]++
        }
        if (member && e.member_id === member.id) {
          mineMap[e.post_id] = mineMap[e.post_id] ?? { liked: false, saved: false }
          if (e.engagement_type === 'like') mineMap[e.post_id].liked = true
          if (e.engagement_type === 'save') mineMap[e.post_id].saved = true
        }
      }
    }

    const posts = slice.map(p => ({
      id: p.id,
      business_id: p.business_id,
      business: p.businesses,
      post_type: p.post_type,
      title: p.title,
      body: p.body,
      media_urls: p.media_urls ?? [],
      media_type: p.media_type,
      ai_generated: p.ai_generated,
      published_at: p.published_at,
      counts: counts[p.id] ?? { like: 0, comment: 0, save: 0 },
      mine: mineMap[p.id] ?? { liked: false, saved: false },
      followed: !!(businessIds && businessIds.includes(p.business_id)),
    }))

    // Fetch stream IDs for live posts so the card can link to the viewer
    const livePostIds = slice.filter(p => p.post_type === 'live').map(p => p.id)
    const liveStreamMap: Record<string, string> = {}
    if (livePostIds.length > 0) {
      const { data: liveStreams } = await supabaseAdmin.from('community_live_streams')
        .select('id,community_post_id').in('community_post_id', livePostIds).eq('status', 'active')
      for (const s of (liveStreams ?? []) as { id: string; community_post_id: string }[]) {
        if (s.community_post_id) liveStreamMap[s.community_post_id] = s.id
      }
    }

    const postsWithStream = posts.map(p => ({
      ...p,
      stream_id: liveStreamMap[p.id] ?? null,
    }))

    // Live posts first, then followed, then recency
    postsWithStream.sort((a, b) => {
      const aLive = a.post_type === 'live', bLive = b.post_type === 'live'
      if (aLive && !bLive) return -1
      if (!aLive && bLive) return 1
      if (a.followed && !b.followed) return -1
      if (!a.followed && b.followed) return 1
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    })

    return NextResponse.json({
      posts: postsWithStream,
      next_cursor: hasMore ? slice[slice.length - 1].published_at : null,
      mode: 'discovery',
      member: member ? { id: member.id, nickname: member.nickname } : null,
    })
  } catch (err) {
    console.error('[community/feed]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
