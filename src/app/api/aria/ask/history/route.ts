export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { renderPath, type ThreadMessage } from '@/lib/aria/conversation-branch'

/**
 * S2B PHASES 1 & 2 — the thread list, and restoring one.
 *
 * ── EVERY QUERY CARRIES ITS OWN business_id FILTER ─────────────────────────────────────────────
 * Not because RLS is absent — it is present and correct — but because this route uses
 * `supabaseAdmin`, the service role, which BYPASSES RLS entirely. In this codebase the policy is
 * never reached, so the filter in the query is the only thing standing between two businesses.
 *
 * ── AND EVERY QUERY EXCLUDES TOMBSTONES ────────────────────────────────────────────────────────
 * `deleted_at IS NULL` on both the list and the single-thread read. Without it on the single read,
 * a deleted thread would vanish from the list but still reopen by id — which is worse than not
 * deleting it at all, because the owner would believe it was gone.
 */

/** How many messages a restored thread returns by default, newest last. */
const MESSAGE_PAGE = 50

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data: biz } = await supabase
    .from('businesses').select('id').eq('user_id', userId).limit(1).maybeSingle()
  return (biz?.id as string) ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ conversations: [] }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ conversations: [] })

  const url = new URL(req.url)
  const withMessages = url.searchParams.get('messages') === 'true'
  const id = url.searchParams.get('id')

  if (id) {
    const { data } = await supabaseAdmin
      .from('aria_conversations')
      .select('id,title,messages,message_count,last_intent,last_message_at,has_escalated,pinned_at,title_edited_at')
      .eq('id', id)
      .eq('business_id', bid)          // the door: supabaseAdmin does not reach RLS
      .is('deleted_at', null)          // a tombstoned thread must not reopen by id
      .maybeSingle()

    if (!data) return NextResponse.json({ conversation: null })

    /**
     * PAGING. The messages are a JSONB array on the row, so the database hands back the whole
     * thread whatever we ask for — but the CLIENT must not be handed an unbounded blob, and the
     * renderer must not be asked to lay out a thousand turns to show the last ten.
     *
     * Superseded turns (S1 phases 2-3) are filtered out first, so paging counts what the owner can
     * actually see rather than including branches they will never be shown.
     */
    const all = renderPath(
      (Array.isArray(data.messages) ? data.messages : []) as ThreadMessage[],
    )
    const offset = Math.max(0, Number(url.searchParams.get('msg_offset') ?? 0) || 0)
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('msg_limit') ?? MESSAGE_PAGE) || MESSAGE_PAGE))

    // newest-last window: the tail of the thread is what the owner wants to see first
    const end = Math.max(0, all.length - offset)
    const start = Math.max(0, end - limit)

    return NextResponse.json({
      conversation: { ...data, messages: all.slice(start, end) },
      message_total: all.length,
      message_offset: offset,
      has_more: start > 0,
    })
  }

  const select = withMessages
    ? 'id,title,messages,message_count,last_intent,last_message_at,has_escalated,pinned_at'
    : 'id,title,message_count,last_intent,last_message_at,has_escalated,pinned_at'

  // PINNED FIRST, THEN NEWEST FIRST — the exact order aria_conversations_biz_recent_idx is built
  // for: (business_id, pinned_at DESC NULLS LAST, last_message_at DESC) WHERE deleted_at IS NULL.
  const { data } = await supabaseAdmin
    .from('aria_conversations')
    .select(select)
    .eq('business_id', bid)
    .is('deleted_at', null)
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('last_message_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ conversations: data ?? [] })
}

export const GET = withErrorCapture('aria/ask/history', _GET)
