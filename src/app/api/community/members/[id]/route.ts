export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// CX-POLISH-4 — public, lightweight member profile.
// PRIVACY: returns ONLY nickname (may be null), joined_at, follow_count, like_count.
// NEVER session_token, push_token, user_id, or email — those columns are not selected here.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: member } = await supabaseAdmin.from('community_members')
      .select('id, nickname, joined_at') // scoped fields only — no token/user_id/push_token
      .eq('id', id).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const [{ count: followCount }, { count: likeCount }] = await Promise.all([
      supabaseAdmin.from('community_follows')
        .select('id', { count: 'exact', head: true }).eq('member_id', id).is('unfollowed_at', null),
      supabaseAdmin.from('community_post_engagement')
        .select('id', { count: 'exact', head: true }).eq('member_id', id).eq('engagement_type', 'like'),
    ])

    return NextResponse.json({
      id: member.id,
      nickname: member.nickname ?? null,
      joined_at: member.joined_at,
      follow_count: followCount ?? 0,
      like_count: likeCount ?? 0,
    })
  } catch (err) {
    console.error('[community/members]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
