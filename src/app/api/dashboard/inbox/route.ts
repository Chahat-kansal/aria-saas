export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

const FILTER_SOURCES: Record<string, string[]> = {
  messages: ['kiosk_chat', 'marketplace_chat', 'kiosk_help_request'],
  demand: ['demand_signal'],
  feedback: ['feedback'],
  flagged: ['community_report', 'blocked_visitor'],
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source')
  const id = searchParams.get('id')

  // ── Detail mode ──
  if (source && id) {
    return detail(bid, source, id)
  }

  // ── List mode ──
  const filter = searchParams.get('filter') ?? 'all'
  let q = supabaseAdmin.from('customer_interactions_v').select('*').eq('business_id', bid).order('created_at', { ascending: false }).limit(150)
  if (filter === 'unread') q = q.eq('has_unread', true)
  else if (FILTER_SOURCES[filter]) q = q.in('source', FILTER_SOURCES[filter])
  const { data: items } = await q

  // Unread count across the whole inbox (independent of current filter).
  const { count: unreadCount } = await supabaseAdmin.from('customer_interactions_v')
    .select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('has_unread', true)

  return NextResponse.json({ items: items ?? [], unread_count: unreadCount ?? 0 })
}

async function detail(bid: string, source: string, id: string) {
  switch (source) {
    case 'kiosk_chat': {
      const { data } = await supabaseAdmin.from('instore_conversations')
        .select('id, business_id, messages, email_captured, started_at, ended_at')
        .eq('id', id).eq('business_id', bid).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ detail: { source, ...data } })
    }
    case 'marketplace_chat': {
      const { data } = await supabaseAdmin.from('marketplace_chats')
        .select('id, business_id, listing_id, member_id, messages, last_message_at, marketplace_listings(title, price, media_urls, status), community_members(nickname)')
        .eq('id', id).eq('business_id', bid).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      // Opening marks the owner side read.
      await supabaseAdmin.from('marketplace_chats').update({ unread_for_owner: false }).eq('id', id).eq('business_id', bid)
      return NextResponse.json({ detail: { source, ...data } })
    }
    case 'demand_signal': {
      const { data } = await supabaseAdmin.from('instore_demand_signals')
        .select('id, business_id, query_text, product_asked, in_stock, signal_type, created_at')
        .eq('id', id).eq('business_id', bid).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ detail: { source, ...data } })
    }
    case 'community_report': {
      const { data } = await supabaseAdmin.from('community_message_reports')
        .select('id, business_id, message_id, reported_by_session_token, reason, status, created_at')
        .eq('id', id).eq('business_id', bid).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ detail: { source, ...data } })
    }
    case 'blocked_visitor': {
      const { data } = await supabaseAdmin.from('community_blocked_visitors')
        .select('id, business_id, session_token, reason, blocked_at')
        .eq('id', id).eq('business_id', bid).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ detail: { source, ...data } })
    }
    case 'kiosk_help_request': {
      const { data } = await supabaseAdmin.from('aria_autopilot_actions')
        .select('id, business_id, title, description, action_data, status, priority, created_at')
        .eq('id', id).eq('business_id', bid).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ detail: { source, ...data } })
    }
    default:
      return NextResponse.json({ error: 'Unknown source' }, { status: 400 })
  }
}

export const GET = withErrorCapture('dashboard/inbox', _GET)
