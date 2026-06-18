export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCommunityMember, createCommunityMember, leaveCommunity } from '@/lib/community/session'

// GET — return the current member (or null). Does not create.
export async function GET() {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ member: null })
    return NextResponse.json({
      member: { id: member.id, nickname: member.nickname, joined_at: member.joined_at },
    })
  } catch (err) {
    console.error('[community/session GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST — create a new anonymous member (the join action). Optional nickname.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const existing = await getCommunityMember()
    if (existing) {
      return NextResponse.json({
        member: { id: existing.id, nickname: existing.nickname, joined_at: existing.joined_at },
        already_joined: true,
      })
    }
    const nickname = typeof body.nickname === 'string' ? body.nickname : null
    const member = await createCommunityMember(nickname)
    return NextResponse.json({
      member: { id: member.id, nickname: member.nickname, joined_at: member.joined_at },
      already_joined: false,
    })
  } catch (err) {
    console.error('[community/session POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH — update editable member fields (still anonymous, still no real name required).
// CX-ACCOUNT-CENTRE-1: partial patch — only the fields PRESENT in the body are touched (a patch that
// omits nickname no longer wipes it). Accepts nickname, avatar_url, bio, and notif_pref_* toggles.
const NOTIF_PREF_KEYS = ['notif_pref_likes', 'notif_pref_comments', 'notif_pref_followers', 'notif_pref_new_posts'] as const
export async function PATCH(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ error: 'No session' }, { status: 401 })
    const body = await req.json().catch(() => ({} as Record<string, unknown>))

    const patch: Record<string, unknown> = {}
    if (typeof body.nickname === 'string') patch.nickname = body.nickname.trim().slice(0, 40) || null
    if (typeof body.bio === 'string') patch.bio = body.bio.trim().slice(0, 160) || null
    if (typeof body.avatar_url === 'string') {
      const u = body.avatar_url.trim().slice(0, 500)
      if (u !== '' && !/^https:\/\//i.test(u)) return NextResponse.json({ error: 'avatar_url must be an https URL.' }, { status: 400 })
      patch.avatar_url = u || null
    }
    for (const k of NOTIF_PREF_KEYS) if (typeof body[k] === 'boolean') patch[k] = body[k]

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    await supabaseAdmin.from('community_members').update(patch).eq('id', member.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/session PATCH]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE — leave the network entirely (clears cookie + clears all follows server-side)
export async function DELETE() {
  try {
    const member = await getCommunityMember()
    if (member) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin')
      const nowIso = new Date().toISOString()
      // Soft-unfollow all
      await supabaseAdmin.from('community_follows').update({ unfollowed_at: nowIso, notifications_on: false }).eq('member_id', member.id).is('unfollowed_at', null)
      await supabaseAdmin.from('community_consent_log').insert({
        member_id: member.id,
        action: 'leave_network',
      })
    }
    await leaveCommunity()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/session DELETE]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
