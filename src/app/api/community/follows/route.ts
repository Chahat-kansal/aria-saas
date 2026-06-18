export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ensureCommunityMember, getCommunityMember, hashIp } from '@/lib/community/session'
import { notifyFollow } from '@/lib/community/notifications'

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? null
}

// GET — list the current member's follows (active only)
export async function GET() {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ follows: [], member: null })
    // CX-ACCOUNT-CENTRE-1 — the Account Centre needs the member's profile + notif prefs too.
    const [{ data }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from('community_follows')
        .select('id, business_id, followed_at, consent_marketing, notifications_on, is_hidden, businesses(name, industry, city, logo_url)')
        .eq('member_id', member.id)
        .is('unfollowed_at', null)
        .order('followed_at', { ascending: false }),
      supabaseAdmin
        .from('community_members')
        .select('avatar_url, bio, notif_pref_likes, notif_pref_comments, notif_pref_followers, notif_pref_new_posts')
        .eq('id', member.id).maybeSingle(),
    ])
    return NextResponse.json({
      follows: data ?? [],
      member: {
        id: member.id,
        nickname: member.nickname,
        joined_at: member.joined_at,
        avatar_url: profile?.avatar_url ?? null,
        bio: profile?.bio ?? null,
        notif_pref_likes: profile?.notif_pref_likes ?? true,
        notif_pref_comments: profile?.notif_pref_comments ?? true,
        notif_pref_followers: profile?.notif_pref_followers ?? true,
        notif_pref_new_posts: profile?.notif_pref_new_posts ?? true,
      },
    })
  } catch (err) {
    console.error('[community/follows GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST — follow a business with explicit per-business consent record
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      business_id?: string
      consent_marketing?: boolean
      notifications_on?: boolean
      nickname?: string
    }
    if (!body.business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

    // Verify the business exists
    const { data: biz } = await supabaseAdmin.from('businesses').select('id').eq('id', body.business_id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    // Create / resolve the anonymous member
    const member = await ensureCommunityMember(body.nickname)

    const consentMarketing = body.consent_marketing === true
    const notificationsOn = body.notifications_on !== false // default true unless explicitly off

    // Upsert the follow — re-following resets unfollowed_at
    const { data: existing } = await supabaseAdmin.from('community_follows')
      .select('id, unfollowed_at')
      .eq('member_id', member.id).eq('business_id', body.business_id).maybeSingle()

    if (existing) {
      await supabaseAdmin.from('community_follows').update({
        unfollowed_at: null,
        followed_at: new Date().toISOString(),
        consent_marketing: consentMarketing,
        notifications_on: notificationsOn,
        is_hidden: false,
      }).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('community_follows').insert({
        member_id: member.id,
        business_id: body.business_id,
        consent_marketing: consentMarketing,
        notifications_on: notificationsOn,
      })
    }

    // Always log consent — Australian Privacy Act / Spam Act compliance
    await supabaseAdmin.from('community_consent_log').insert({
      member_id: member.id,
      business_id: body.business_id,
      action: 'follow',
      consent_marketing: consentMarketing,
      notifications_on: notificationsOn,
      ip_hash: hashIp(clientIp(req)),
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    })

    // CX-POLISH-1: notify the owner only on a genuine NEW follow or re-follow (not a prefs re-save of an
    // already-active follow). Fire-and-forget — never blocks the follow.
    if (!existing || existing.unfollowed_at != null) {
      void notifyFollow({ businessId: body.business_id, actorMemberId: member.id })
    }

    return NextResponse.json({ ok: true, member_id: member.id })
  } catch (err) {
    console.error('[community/follows POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH — update preferences on an existing follow (consent_marketing, notifications_on, is_hidden)
export async function PATCH(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ error: 'No session' }, { status: 401 })

    const body = await req.json() as {
      business_id?: string
      consent_marketing?: boolean
      notifications_on?: boolean
      is_hidden?: boolean
    }
    if (!body.business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (body.consent_marketing !== undefined) patch.consent_marketing = !!body.consent_marketing
    if (body.notifications_on !== undefined) patch.notifications_on = !!body.notifications_on
    if (body.is_hidden !== undefined) patch.is_hidden = !!body.is_hidden
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 })

    await supabaseAdmin.from('community_follows').update(patch)
      .eq('member_id', member.id).eq('business_id', body.business_id)

    await supabaseAdmin.from('community_consent_log').insert({
      member_id: member.id,
      business_id: body.business_id,
      action: 'update_preferences',
      consent_marketing: body.consent_marketing ?? null,
      notifications_on: body.notifications_on ?? null,
      ip_hash: hashIp(clientIp(req)),
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/follows PATCH]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE — unfollow a business (soft delete — keeps the consent audit trail)
export async function DELETE(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ error: 'No session' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const business_id = searchParams.get('business_id')
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

    await supabaseAdmin.from('community_follows').update({
      unfollowed_at: new Date().toISOString(),
      notifications_on: false,
    }).eq('member_id', member.id).eq('business_id', business_id)

    await supabaseAdmin.from('community_consent_log').insert({
      member_id: member.id,
      business_id,
      action: 'unfollow',
      ip_hash: hashIp(clientIp(req)),
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/follows DELETE]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
