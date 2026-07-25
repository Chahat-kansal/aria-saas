export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'
import { COMMUNITY_BUSINESS_CARD, getTestBusinessIds, excludeIdsClause } from '@/lib/community/query-helpers'

// Public — active stories (is_story=true AND expires_at > now AND status=published).
// One bubble per business showing their most recent active story.
// Returns seen/is_own state per bubble for ring differentiation.
export async function GET() {
  try {
    const member = await getCommunityMember()
    const nowIso = new Date().toISOString()

    let storyQ = supabaseAdmin
      .from('community_posts')
      .select(`id, business_id, body, media_urls, media_type, published_at, expires_at, ${COMMUNITY_BUSINESS_CARD}`)
      .eq('status', 'published')
      .eq('is_story', true)
      .gt('expires_at', nowIso)
      .order('published_at', { ascending: false })
      .limit(200)
    // SECURITY-P4 follow-up — cross-business stories row (the "who's active right now" bubble row);
    // test/fixture businesses never belong in it.
    const testExcl = excludeIdsClause(await getTestBusinessIds(supabaseAdmin))
    if (testExcl) storyQ = storyQ.not('business_id', 'in', testExcl)
    const { data: rows, error } = await storyQ

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type Row = {
      id: string; business_id: string; body: string | null
      media_urls: string[]; media_type: string | null
      published_at: string; expires_at: string
      businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null } | null
    }
    const allRows = (rows ?? []) as unknown as Row[]

    // Which stories has this member already seen?
    const seenIds = new Set<string>()
    if (member) {
      const storyIds = allRows.map(r => r.id)
      if (storyIds.length > 0) {
        const { data: seenEngs } = await supabaseAdmin
          .from('community_post_engagement')
          .select('post_id')
          .in('post_id', storyIds)
          .eq('member_id', member.id)
          .eq('engagement_type', 'story_view')
        for (const e of (seenEngs ?? []) as { post_id: string | null }[]) {
          if (e.post_id) seenIds.add(e.post_id)
        }
      }
    }

    // Resolve this member's own business (if any) for the "own" ring
    let ownBusinessId: string | null = null
    if (member?.user_id) {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .eq('user_id', member.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      ownBusinessId = biz?.id ?? null
    }

    // Group by business, keep all stories per business (sorted newest-first)
    const grouped: Record<string, Row[]> = {}
    for (const r of allRows) {
      if (!grouped[r.business_id]) grouped[r.business_id] = []
      grouped[r.business_id].push(r)
    }

    const bubbles = Object.entries(grouped).map(([bid, list]) => {
      const stories = list.map(s => ({
        id: s.id,
        body: s.body,
        media_urls: Array.isArray(s.media_urls) ? s.media_urls : [],
        media_type: s.media_type,
        published_at: s.published_at,
        expires_at: s.expires_at,
        seen: seenIds.has(s.id),
      }))
      const allSeen = stories.length > 0 && stories.every(s => s.seen)
      return {
        business_id: bid,
        business: list[0].businesses,
        story_count: list.length,
        latest_at: list[0].published_at,
        stories,
        seen: allSeen,
        is_own: bid === ownBusinessId,
      }
    })

    // Sort: own story first, then unseen (newest-first), then seen
    bubbles.sort((a, b) => {
      if (a.is_own && !b.is_own) return -1
      if (!a.is_own && b.is_own) return 1
      if (!a.seen && b.seen) return -1
      if (a.seen && !b.seen) return 1
      return b.latest_at < a.latest_at ? -1 : 1
    })

    return NextResponse.json({ bubbles })
  } catch (err) {
    console.error('[community/stories]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
