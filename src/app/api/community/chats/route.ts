export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { COMMUNITY_BUSINESS_CARD } from '@/lib/community/query-helpers'
import { ensureCommunityMember, getCommunityMember } from '@/lib/community/session'
import { checkPrivacyFull } from '@/lib/community/privacy-guard'
import { checkAbuseFull, logMessage } from '@/lib/community/abuse-guard'

interface ChatMessage {
  from: 'member' | 'owner'
  text: string
  ts: string
}

// GET — list this anonymous member's chat threads, or one thread by ?id=
export async function GET(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ chats: [], member: null })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const listing_id = searchParams.get('listing_id')

    if (id) {
      const { data: chat } = await supabaseAdmin.from('marketplace_chats')
        .select(`id, listing_id, business_id, messages, created_at, last_message_at, marketplace_listings(title, price, media_urls, status, ${COMMUNITY_BUSINESS_CARD})`)
        .eq('id', id).eq('member_id', member.id).maybeSingle()
      if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      // Mark as read by member
      await supabaseAdmin.from('marketplace_chats').update({ unread_for_member: false }).eq('id', id)
      return NextResponse.json({ chat })
    }

    if (listing_id) {
      // Resolve member's thread for this listing (if any)
      const { data: chat } = await supabaseAdmin.from('marketplace_chats')
        .select('id, listing_id, business_id, messages, created_at, last_message_at')
        .eq('listing_id', listing_id).eq('member_id', member.id).maybeSingle()
      return NextResponse.json({ chat: chat ?? null })
    }

    // Joins BOTH the listing (for marketplace chats) and the business directly (for business DMs,
    // which have listing_id IS NULL and therefore no listing to render).
    const { data } = await supabaseAdmin.from('marketplace_chats')
      .select(`id, listing_id, business_id, messages, last_message_at, unread_for_member, ${COMMUNITY_BUSINESS_CARD}, marketplace_listings(title, price, media_urls, status, ${COMMUNITY_BUSINESS_CARD})`)
      .eq('member_id', member.id)
      .order('last_message_at', { ascending: false })
      .limit(50)
    return NextResponse.json({ chats: data ?? [], member: { id: member.id, nickname: member.nickname } })
  } catch (err) {
    console.error('[community/chats GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST — send a message in (or open) a chat thread for a listing.
// Body: { listing_id, text }. Member is the anonymous community visitor (auto-created if absent).
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { listing_id?: string; text?: string }
    if (!body.listing_id || !body.text) {
      return NextResponse.json({ error: 'listing_id and text required' }, { status: 400 })
    }
    const text = String(body.text).trim().slice(0, 1000)
    if (!text) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 })

    // Resolve listing → business
    const { data: listing } = await supabaseAdmin.from('marketplace_listings')
      .select('id, business_id, status').eq('id', body.listing_id).maybeSingle()
    if (!listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
    if (listing.status === 'hidden') return NextResponse.json({ error: 'Listing not available.' }, { status: 403 })

    // Ensure member exists (anonymous — no PII captured)
    const member = await ensureCommunityMember()

    // Abuse + spam guard (block-list → rate-limit → profanity/threat → history-gated Haiku)
    const abuse = await checkAbuseFull(listing.business_id, member.session_token, text)
    if (abuse.blocked) {
      await logMessage(listing.business_id, member.session_token, !!abuse.flagged)
      if (abuse.rateLimited) return NextResponse.json({ blocked: true, reason: abuse.reason, retry_after: abuse.retryAfter }, { status: 429 })
      return NextResponse.json({ blocked: true, reason: abuse.reason }, { status: 403 })
    }

    // Privacy guard — BLOCK personal details before delivery, regex first then optional Haiku
    const guard = await checkPrivacyFull(text)
    if (guard.blocked) {
      await logMessage(listing.business_id, member.session_token, false)
      return NextResponse.json({ blocked: true, reason: guard.reason }, { status: 400 })
    }

    // Clean message — record for rate-limit ledger
    await logMessage(listing.business_id, member.session_token, false)

    const now = new Date().toISOString()
    const newMsg: ChatMessage = { from: 'member', text, ts: now }

    // Upsert thread (one per listing+member)
    const { data: existing } = await supabaseAdmin.from('marketplace_chats')
      .select('id, messages').eq('listing_id', body.listing_id).eq('member_id', member.id).maybeSingle()

    if (existing) {
      const prev = Array.isArray(existing.messages) ? existing.messages as ChatMessage[] : []
      const next = [...prev, newMsg]
      await supabaseAdmin.from('marketplace_chats').update({
        messages: next,
        last_message_at: now,
        unread_for_owner: true,
        unread_for_member: false,
      }).eq('id', existing.id)
      return NextResponse.json({ ok: true, chat_id: existing.id })
    }

    const { data: created, error } = await supabaseAdmin.from('marketplace_chats').insert({
      listing_id: body.listing_id,
      business_id: listing.business_id,
      member_id: member.id,
      messages: [newMsg],
      last_message_at: now,
      unread_for_owner: true,
      unread_for_member: false,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, chat_id: created?.id })
  } catch (err) {
    console.error('[community/chats POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
