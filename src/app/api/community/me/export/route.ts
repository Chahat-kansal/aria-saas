export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCommunityMember } from '@/lib/community/session'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { tallyEngagementTypes } from '@/lib/community/query-helpers'

// CX-ACCOUNT-CENTRE-2 — the current member's OWN data: activity counts (for the Account Centre) +
// the full export (AU Privacy Act APP nicety — "download my data"). Member-scoped via the session
// cookie — only ever returns the requester's own data (never another member's).
export async function GET() {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ error: 'No session' }, { status: 401 })
    const id = member.id

    const [profileRes, followsRes, savedRes, engTypesRes, messagedRes] = await Promise.all([
      supabaseAdmin.from('community_members').select('avatar_url, bio').eq('id', id).maybeSingle(),
      supabaseAdmin.from('community_follows')
        .select('business_id, followed_at, businesses(name)')
        .eq('member_id', id).is('unfollowed_at', null).order('followed_at', { ascending: false }),
      supabaseAdmin.from('community_post_engagement')
        .select('post_id, created_at, community_posts(title, businesses(name))')
        .eq('member_id', id).eq('engagement_type', 'save').order('created_at', { ascending: false }).limit(200),
      // F5 — one grouped tally replaces the separate like + comment count queries (saved stays the list length).
      supabaseAdmin.from('community_post_engagement').select('engagement_type').eq('member_id', id),
      supabaseAdmin.from('marketplace_chats').select('business_id').eq('member_id', id),
    ])
    const eng = tallyEngagementTypes(engTypesRes.data as Array<{ engagement_type: string | null }> | null)

    const follows = ((followsRes.data ?? []) as unknown as Array<{ business_id: string; followed_at: string; businesses: { name: string | null } | null }>)
      .map(f => ({ business_id: f.business_id, business: f.businesses?.name ?? null, followed_at: f.followed_at }))
    const saved = ((savedRes.data ?? []) as unknown as Array<{ post_id: string; created_at: string; community_posts: { title: string | null; businesses: { name: string | null } | null } | null }>)
      .map(s => ({ post_id: s.post_id, title: s.community_posts?.title ?? null, business: s.community_posts?.businesses?.name ?? null, saved_at: s.created_at }))
    const messagedBiz = new Set(((messagedRes.data ?? []) as Array<{ business_id: string | null }>).map(m => m.business_id).filter(Boolean))

    return NextResponse.json({
      profile: {
        id,
        nickname: member.nickname,
        avatar_url: profileRes.data?.avatar_url ?? null,
        bio: profileRes.data?.bio ?? null,
        joined_at: member.joined_at,
        data_persists: !!member.user_id,
      },
      activity: {
        following: follows.length,
        saved: saved.length,
        liked: eng.like,
        comments: eng.comment,
        messaged: messagedBiz.size,
      },
      follows,
      saved,
      exported_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[community/me/export]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
