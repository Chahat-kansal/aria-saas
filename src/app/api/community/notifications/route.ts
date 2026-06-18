export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'

// GET — the current member's notifications.
//   ?count_only=true → returns just { unread_count } WITHOUT marking anything read (for the nav badge).
//   otherwise        → returns the last 30 (newest-first) + unread_count, and marks them all read.
export async function GET(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ notifications: [], unread_count: 0, member: null })

    const { searchParams } = new URL(req.url)
    const countOnly = searchParams.get('count_only') === 'true'

    // Unread count — cheap, never mutates.
    const { count: unread } = await supabaseAdmin.from('community_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', member.id)
      .is('read_at', null)

    if (countOnly) {
      return NextResponse.json({ unread_count: unread ?? 0 })
    }

    const { data } = await supabaseAdmin.from('community_notifications')
      .select('id, type, actor_member_id, actor_business_id, post_id, read_at, created_at, businesses:actor_business_id(name, logo_url), actor_member:actor_member_id(nickname), community_posts:post_id(title, post_type)')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
      .limit(30)

    const unreadBefore = unread ?? 0
    // Mark everything unread as read now that the member is viewing the list.
    if (unreadBefore > 0) {
      await supabaseAdmin.from('community_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('member_id', member.id)
        .is('read_at', null)
    }

    return NextResponse.json({ notifications: data ?? [], unread_count: unreadBefore })
  } catch (err) {
    console.error('[community/notifications GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH — mark all the current member's notifications as read.
export async function PATCH() {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ ok: true, updated: 0 })
    await supabaseAdmin.from('community_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('member_id', member.id)
      .is('read_at', null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/notifications PATCH]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
