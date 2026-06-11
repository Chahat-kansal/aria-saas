export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ensureCommunityMember, getCommunityMember } from '@/lib/community/session'
import { checkPrivacyFull } from '@/lib/community/privacy-guard'

interface DmMessage {
  from: 'member' | 'owner'
  text: string
  ts: string
}

// GET — get or resolve the DM thread between current member and a business.
// ?business_id=xxx — returns thread id + messages + business info
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const business_id = searchParams.get('business_id')
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ thread: null, member: null })

    const { data: biz } = await supabaseAdmin.from('businesses')
      .select('id, name, logo_url, industry, city').eq('id', business_id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const { data: thread } = await supabaseAdmin.from('marketplace_chats')
      .select('id, messages, last_message_at, unread_for_member')
      .eq('member_id', member.id)
      .eq('business_id', business_id)
      .is('listing_id', null)
      .maybeSingle()

    if (thread) {
      // Mark as read for member
      await supabaseAdmin.from('marketplace_chats')
        .update({ unread_for_member: false })
        .eq('id', thread.id)
    }

    return NextResponse.json({
      thread: thread
        ? { id: thread.id, messages: (thread.messages ?? []) as DmMessage[], last_message_at: thread.last_message_at }
        : null,
      business: biz,
      member: { id: member.id, nickname: member.nickname },
    })
  } catch (err) {
    console.error('[community/dm GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST — send a DM message from the current member to a business.
// Body: { business_id, text }
// Privacy filter applied before insert. Flagged messages are logged and rejected.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { business_id?: string; text?: string }
    if (!body.business_id || !body.text) {
      return NextResponse.json({ error: 'business_id and text required' }, { status: 400 })
    }
    const text = String(body.text).trim().slice(0, 1000)
    if (!text) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 })

    const { data: biz } = await supabaseAdmin.from('businesses')
      .select('id').eq('id', body.business_id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const member = await ensureCommunityMember()

    // Privacy guard — block phone numbers, emails, addresses BEFORE insert
    const guard = await checkPrivacyFull(text)
    if (guard.blocked) {
      await supabaseAdmin.from('community_message_log').insert({
        session_token: member.session_token,
        business_id: body.business_id,
        flagged: true,
      })
      return NextResponse.json({ blocked: true, reason: guard.reason }, { status: 400 })
    }

    // Log clean message to community_message_log
    await supabaseAdmin.from('community_message_log').insert({
      session_token: member.session_token,
      business_id: body.business_id,
      flagged: false,
    })

    const now = new Date().toISOString()
    const newMsg: DmMessage = { from: 'member', text, ts: now }

    // Find existing DM thread (listing_id = null signals DM, not listing chat)
    const { data: existing } = await supabaseAdmin.from('marketplace_chats')
      .select('id, messages')
      .eq('member_id', member.id)
      .eq('business_id', body.business_id)
      .is('listing_id', null)
      .maybeSingle()

    if (existing) {
      const prev = Array.isArray(existing.messages) ? existing.messages as DmMessage[] : []
      await supabaseAdmin.from('marketplace_chats').update({
        messages: [...prev, newMsg],
        last_message_at: now,
        unread_for_owner: true,
        unread_for_member: false,
      }).eq('id', existing.id)
      return NextResponse.json({ ok: true, thread_id: existing.id })
    }

    const { data: created, error } = await supabaseAdmin.from('marketplace_chats').insert({
      member_id: member.id,
      business_id: body.business_id,
      listing_id: null,
      messages: [newMsg],
      last_message_at: now,
      unread_for_owner: true,
      unread_for_member: false,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, thread_id: created?.id })
  } catch (err) {
    console.error('[community/dm POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
