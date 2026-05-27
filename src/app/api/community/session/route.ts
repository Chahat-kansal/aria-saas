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

// PATCH — update the nickname (still anonymous, still no real name required)
export async function PATCH(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ error: 'No session' }, { status: 401 })
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 40) : null
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    await supabaseAdmin.from('community_members').update({ nickname }).eq('id', member.id)
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
