export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'
import { COMMUNITY_BUSINESS_CARD } from '@/lib/community/query-helpers'

// Public — reels (media_type='reel') across the network. TikTok-style discovery.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(30, Math.max(5, parseInt(searchParams.get('limit') ?? '15')))
    const before = searchParams.get('before')
    const businessId = searchParams.get('business_id')  // CX-1-P3: optional per-business filter

    const member = await getCommunityMember()

    let q = supabaseAdmin.from('community_posts')
      .select(`id, business_id, title, body, media_urls, published_at, ${COMMUNITY_BUSINESS_CARD}`)
      .eq('status', 'published')
      .eq('media_type', 'reel')
      .order('published_at', { ascending: false })
      .limit(limit + 1)
    if (businessId) q = q.eq('business_id', businessId)  // network-wide when absent (unchanged)
    if (before) q = q.lt('published_at', before)

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type Row = {
      id: string; business_id: string; title: string | null; body: string | null
      media_urls: string[]; published_at: string
      businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null } | null
    }
    const list = (rows ?? []) as unknown as Row[]
    const hasMore = list.length > limit
    const slice = hasMore ? list.slice(0, limit) : list

    // Per-reel engagement
    const ids = slice.map(r => r.id)
    let counts: Record<string, { like: number; comment: number; save: number }> = {}
    let mineMap: Record<string, { liked: boolean; saved: boolean }> = {}
    if (ids.length > 0) {
      const { data: engs } = await supabaseAdmin.from('community_post_engagement')
        .select('post_id, engagement_type, member_id').in('post_id', ids)
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

    const reels = slice.map(r => ({
      id: r.id,
      business_id: r.business_id,
      business: r.businesses,
      title: r.title,
      body: r.body,
      video_url: r.media_urls?.[0] ?? null,
      thumbnail_url: r.media_urls?.[1] ?? null,
      published_at: r.published_at,
      counts: counts[r.id] ?? { like: 0, comment: 0, save: 0 },
      mine: mineMap[r.id] ?? { liked: false, saved: false },
    }))

    return NextResponse.json({
      reels,
      next_cursor: hasMore ? slice[slice.length - 1].published_at : null,
    })
  } catch (err) {
    console.error('[community/reels]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
