export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { renderPath, type ThreadMessage } from '@/lib/aria/conversation-branch'
import { bestMatchingMessage } from '@/lib/aria/search-match'

/**
 * S2B PHASE 4 — SEARCH.
 *
 * ── THE INDEX AND THE QUERY SHAPE ──────────────────────────────────────────────────────────────
 *
 *   index:  aria_conversations_search_idx  GIN (search_tsv)
 *   column: search_tsv  GENERATED ALWAYS AS (aria_conv_search_tsv(title, messages)) STORED
 *           -> to_tsvector('english', title || ' ' || every message's content)
 *
 *   query:  SELECT … FROM aria_conversations
 *            WHERE business_id = $bid          -- the door, not RLS
 *              AND deleted_at IS NULL          -- tombstones never appear
 *              AND search_tsv @@ websearch_to_tsquery('english', $q)
 *            ORDER BY pinned_at DESC NULLS LAST, last_message_at DESC
 *
 * `websearch_to_tsquery` rather than `to_tsquery` because it accepts what a person actually types —
 * bare words, "quoted phrases", OR, minus-signs — and never throws on punctuation. `to_tsquery`
 * raises a syntax error on an unbalanced quote, which would turn a typo into a 500.
 *
 * ── NO EMBEDDINGS, DELIBERATELY ────────────────────────────────────────────────────────────────
 * The sprint forbids them and it is right at this scale: 288 threads. Semantic search means an
 * embedding pipeline, a vector column, a backfill, and a re-embed on every edit — infrastructure to
 * maintain forever, to beat a GIN index that answers in single-digit milliseconds over a café's few
 * hundred conversations.
 *
 * ── WHY THE MATCHING MESSAGE IS FOUND IN CODE, NOT IN SQL ──────────────────────────────────────
 * The index tells us WHICH THREAD matches; it cannot tell us which message inside the JSONB array
 * did, because the whole thread is one tsvector. Rather than a second, cleverer query, the matching
 * message is located in TypeScript over the returned rows — where it is testable as a pure function
 * and where superseded branches (S1 phases 2-3) can be excluded from the result.
 */

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
  if (!user) return NextResponse.json({ results: [] }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ results: [] })

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  // An empty search is not an error and must not return everything.
  if (q.length < 2) return NextResponse.json({ results: [], query: q })

  const { data, error } = await supabaseAdmin
    .from('aria_conversations')
    .select('id, title, messages, last_message_at, pinned_at')
    .eq('business_id', bid)                                   // the door: supabaseAdmin skips RLS
    .is('deleted_at', null)                                   // tombstones never appear
    .textSearch('search_tsv', q, { type: 'websearch', config: 'english' })
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('last_message_at', { ascending: false })
    .limit(25)

  if (error) {
    console.error('[aria/ask/search] failed:', error.message)
    return NextResponse.json({ error: 'Search is unavailable just now', results: [] }, { status: 503 })
  }

  const results = (data ?? []).map(row => {
    const live = renderPath((Array.isArray(row.messages) ? row.messages : []) as ThreadMessage[])
    const hit = bestMatchingMessage(live, q)
    return {
      id: row.id,
      title: row.title,
      last_message_at: row.last_message_at,
      pinned: Boolean(row.pinned_at),
      // where to open the thread, and the line to show in the result
      match_index: hit.index,
      snippet: hit.snippet,
      match_role: hit.role,
    }
  })

  return NextResponse.json({ results, query: q })
}

export const GET = withErrorCapture('aria/ask/search', _GET)
