export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'

// DELETE — remove a single PushSubscription (by endpoint) for the current member.
// Body: { endpoint }
export async function DELETE(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ error: 'No session' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as { endpoint?: string }
    if (!body.endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
    await supabaseAdmin.from('community_push_subscriptions')
      .delete()
      .eq('member_id', member.id)
      .eq('endpoint', body.endpoint)
    // If this was the last subscription, flip push_enabled off
    const { count } = await supabaseAdmin.from('community_push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', member.id)
    if ((count ?? 0) === 0) {
      await supabaseAdmin.from('community_members').update({ push_enabled: false }).eq('id', member.id)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/push/unsubscribe]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
