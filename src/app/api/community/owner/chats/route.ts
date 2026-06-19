export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveOwnerBusinessId as getBid } from '@/lib/community/resolveOwnerBusinessId'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { checkPrivacyFull } from '@/lib/community/privacy-guard'
import { checkAbuseRegex } from '@/lib/community/abuse-guard'


interface ChatMessage { from: 'member' | 'owner'; text: string; ts: string }

// GET — list chat threads for this business (optionally a single ?id=)
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    const { data: chat } = await supabaseAdmin.from('marketplace_chats')
      .select('id, listing_id, member_id, messages, created_at, last_message_at, marketplace_listings(title, price, media_urls, status), community_members(nickname)')
      .eq('id', id).eq('business_id', bid).maybeSingle()
    if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Mark as read by owner
    await supabaseAdmin.from('marketplace_chats').update({ unread_for_owner: false }).eq('id', id)
    return NextResponse.json({ chat })
  }

  const { data } = await supabaseAdmin.from('marketplace_chats')
    .select('id, listing_id, messages, last_message_at, unread_for_owner, marketplace_listings(title, price, media_urls, status), community_members(nickname)')
    .eq('business_id', bid)
    .order('last_message_at', { ascending: false })
    .limit(100)
  return NextResponse.json({ chats: data ?? [] })
}

// POST — owner sends a reply in an existing chat (also runs the privacy guard)
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { chat_id?: string; text?: string }
  if (!body.chat_id || !body.text) return NextResponse.json({ error: 'chat_id and text required' }, { status: 400 })
  const text = String(body.text).trim().slice(0, 1000)
  if (!text) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 })

  // Both guards apply to owner replies too (per the prompt — both directions)
  const abuse = checkAbuseRegex(text)
  if (abuse.blocked) return NextResponse.json({ blocked: true, reason: abuse.reason }, { status: 403 })
  const guard = await checkPrivacyFull(text)
  if (guard.blocked) return NextResponse.json({ blocked: true, reason: guard.reason }, { status: 400 })

  const { data: chat } = await supabaseAdmin.from('marketplace_chats')
    .select('id, messages').eq('id', body.chat_id).eq('business_id', bid).maybeSingle()
  if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()
  const prev = Array.isArray(chat.messages) ? chat.messages as ChatMessage[] : []
  const next = [...prev, { from: 'owner' as const, text, ts: now }]
  await supabaseAdmin.from('marketplace_chats').update({
    messages: next,
    last_message_at: now,
    unread_for_member: true,
    unread_for_owner: false,
  }).eq('id', body.chat_id)
  return NextResponse.json({ ok: true })
}

export const GET  = withErrorCapture('community/owner/chats', _GET)
export const POST = withErrorCapture('community/owner/chats', _POST)
