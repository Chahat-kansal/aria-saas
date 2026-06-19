export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { tallyEngagementTypes } from '@/lib/community/query-helpers'

// CX-POLISH-4 — public, lightweight member profile.
// PRIVACY: returns ONLY nickname (may be null), joined_at, follow_count, like_count.
// NEVER session_token, push_token, user_id, or email — those columns are not selected here.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: member } = await supabaseAdmin.from('community_members')
      .select('id, nickname, joined_at, avatar_url, bio') // scoped fields only — no token/user_id/push_token/email
      .eq('id', id).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    // F5 — follows count stays separate (different table); like/save now from ONE grouped engagement
    // tally with zero-fill (0 when the member has none of that type).
    const [{ count: followCount }, { data: engRows }] = await Promise.all([
      supabaseAdmin.from('community_follows')
        .select('id', { count: 'exact', head: true }).eq('member_id', id).is('unfollowed_at', null),
      supabaseAdmin.from('community_post_engagement')
        .select('engagement_type').eq('member_id', id),
    ])
    const eng = tallyEngagementTypes(engRows as Array<{ engagement_type: string | null }> | null)

    return NextResponse.json({
      id: member.id,
      nickname: member.nickname ?? null,
      avatar_url: member.avatar_url ?? null,
      bio: member.bio ?? null,
      joined_at: member.joined_at,
      follow_count: followCount ?? 0,
      like_count: eng.like,
      saved_count: eng.save,
    })
  } catch (err) {
    console.error('[community/members]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
