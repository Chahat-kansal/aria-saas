export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveOwnerBusinessId as getBid } from '@/lib/community/resolveOwnerBusinessId'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'


// GET — list blocked visitors + pending reports for this business
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const [blockedRes, reportsRes] = await Promise.all([
    supabaseAdmin.from('community_blocked_visitors').select('id, session_token, reason, blocked_at').eq('business_id', bid).order('blocked_at', { ascending: false }),
    supabaseAdmin.from('community_message_reports').select('id, message_id, reason, status, created_at').eq('business_id', bid).eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
  ])
  return NextResponse.json({ blocked: blockedRes.data ?? [], reports: reportsRes.data ?? [] })
}

// POST — block a visitor's session_token for this business. Body: { session_token, reason? }
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { session_token?: string; reason?: string; chat_id?: string }

  // Allow blocking by chat_id (resolve to that thread's member session_token) or directly.
  let token = body.session_token ?? null
  if (!token && body.chat_id) {
    const { data: chat } = await supabaseAdmin.from('marketplace_chats')
      .select('member_id, community_members(session_token)')
      .eq('id', body.chat_id).eq('business_id', bid).maybeSingle()
    const m = (chat as unknown as { community_members: { session_token: string | null } | null } | null)?.community_members
    token = m?.session_token ?? null
  }
  if (!token) return NextResponse.json({ error: 'session_token or chat_id required' }, { status: 400 })

  await supabaseAdmin.from('community_blocked_visitors').upsert({
    business_id: bid,
    session_token: token,
    reason: (body.reason ?? '').toString().slice(0, 280) || null,
  }, { onConflict: 'business_id,session_token' })
  return NextResponse.json({ ok: true })
}

// DELETE — unblock. Query: ?session_token=
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('session_token')
  if (!token) return NextResponse.json({ error: 'session_token required' }, { status: 400 })
  await supabaseAdmin.from('community_blocked_visitors').delete().eq('business_id', bid).eq('session_token', token)
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('community/owner/block', _GET)
export const POST   = withErrorCapture('community/owner/block', _POST)
export const DELETE = withErrorCapture('community/owner/block', _DELETE)
