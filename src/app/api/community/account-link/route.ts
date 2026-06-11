export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveOrLinkMember, getCommunityMember } from '@/lib/community/session'

// GET — return whether the current community session is linked to an auth account
export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    const member = await getCommunityMember()
    return NextResponse.json({
      linked: !!(user && member?.user_id === user.id),
      has_session: !!member,
      has_auth: !!user,
    })
  } catch (err) {
    console.error('[community/account-link GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST — link the authenticated Supabase user to the current community session member.
// Idempotent: safe to call multiple times. Follows/engagement on members.id persist — no re-keying.
export async function POST() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const member = await resolveOrLinkMember(user.id)
    if (!member) {
      return NextResponse.json({ error: 'No community session to link. Join the community first.' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      member_id: member.id,
      nickname: member.nickname,
    })
  } catch (err) {
    console.error('[community/account-link POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
