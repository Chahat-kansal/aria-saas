export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'

// Public — active stories (is_story=true AND expires_at > now AND status=published).
// One bubble per business showing their most recent active story.
export async function GET() {
  try {
    const member = await getCommunityMember()
    const nowIso = new Date().toISOString()

    let businessIds: string[] | null = null
    if (member) {
      const { data: follows } = await supabaseAdmin
        .from('community_follows')
        .select('business_id, is_hidden')
        .eq('member_id', member.id)
        .is('unfollowed_at', null)
      const list = (follows ?? []) as Array<{ business_id: string; is_hidden: boolean }>
      businessIds = list.filter(f => !f.is_hidden).map(f => f.business_id)
    }

    let q = supabaseAdmin.from('community_posts')
      .select('id, business_id, body, media_urls, media_type, published_at, expires_at, businesses(name, logo_url, community_verified)')
      .eq('status', 'published')
      .eq('is_story', true)
      .gt('expires_at', nowIso)
      .order('published_at', { ascending: false })
      .limit(100)

    if (businessIds && businessIds.length > 0) {
      q = q.in('business_id', businessIds)
    }

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Group by business, keep most-recent story per business
    type Row = {
      id: string; business_id: string; body: string | null
      media_urls: string[]; media_type: string | null
      published_at: string; expires_at: string
      businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null } | null
    }
    const grouped: Record<string, Row[]> = {}
    for (const r of (rows ?? []) as unknown as Row[]) {
      if (!grouped[r.business_id]) grouped[r.business_id] = []
      grouped[r.business_id].push(r)
    }
    const bubbles = Object.entries(grouped).map(([bid, list]) => ({
      business_id: bid,
      business: list[0].businesses,
      story_count: list.length,
      latest_at: list[0].published_at,
      stories: list.map(s => ({
        id: s.id,
        body: s.body,
        media_urls: s.media_urls ?? [],
        media_type: s.media_type,
        published_at: s.published_at,
        expires_at: s.expires_at,
      })),
    })).sort((a, b) => (b.latest_at < a.latest_at ? -1 : 1))

    return NextResponse.json({ bubbles })
  } catch (err) {
    console.error('[community/stories]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
