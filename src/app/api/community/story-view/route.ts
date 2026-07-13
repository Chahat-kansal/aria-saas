export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'

// POST — mark a story as seen by this member.
// Body: { story_id: string }
// Deduped per (member_id, post_id) — safe to call on every story open.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { story_id?: string }
    if (!body.story_id) {
      return NextResponse.json({ error: 'story_id required' }, { status: 400 })
    }

    const member = await getCommunityMember()
    if (!member) {
      // Anonymous, no dedup possible — skip
      return NextResponse.json({ ok: true })
    }

    const { count } = await supabaseAdmin
      .from('community_post_engagement')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', body.story_id)
      .eq('member_id', member.id)
      .eq('engagement_type', 'story_view')

    if ((count ?? 0) === 0) {
      await supabaseAdmin.from('community_post_engagement').insert({
        post_id: body.story_id,
        member_id: member.id,
        engagement_type: 'story_view',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/story-view]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
