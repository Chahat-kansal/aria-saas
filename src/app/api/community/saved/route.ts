export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'
import { COMMUNITY_BUSINESS_CARD } from '@/lib/community/query-helpers'

// Public — list this anonymous member's saved posts (the "Saved offers wallet")
export async function GET() {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ posts: [], member: null })

    const { data: saves } = await supabaseAdmin.from('community_post_engagement')
      .select(`post_id, created_at, community_posts(id, business_id, post_type, title, body, media_urls, media_type, published_at, is_story, expires_at, ${COMMUNITY_BUSINESS_CARD})`)
      .eq('member_id', member.id)
      .eq('engagement_type', 'save')
      .order('created_at', { ascending: false })
      .limit(100)

    type Row = {
      post_id: string; created_at: string
      community_posts: {
        id: string; business_id: string; post_type: string; title: string | null; body: string | null
        media_urls: string[]; media_type: string | null; published_at: string | null
        is_story: boolean; expires_at: string | null
        businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null } | null
      } | null
    }
    const list = (saves ?? []) as unknown as Row[]
    const now = Date.now()

    const posts = list
      .filter(r => r.community_posts)
      .map(r => {
        const p = r.community_posts!
        const isExpired = p.is_story && p.expires_at ? new Date(p.expires_at).getTime() < now : false
        return {
          id: p.id,
          business_id: p.business_id,
          business: p.businesses,
          post_type: p.post_type,
          title: p.title,
          body: p.body,
          media_urls: p.media_urls ?? [],
          media_type: p.media_type,
          published_at: p.published_at,
          saved_at: r.created_at,
          is_story: p.is_story,
          expires_at: p.expires_at,
          is_expired: isExpired,
        }
      })
    return NextResponse.json({ posts, member: { id: member.id, nickname: member.nickname } })
  } catch (err) {
    console.error('[community/saved]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
