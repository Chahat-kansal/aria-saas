export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
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

/**
 * BUSINESS CONTEXT COMES FROM THE CANON RAIL (CANON-RAIL-1), NOT A LOCAL RESOLVER.
 *
 * This route originally carried its own five-line `getBid`. The canon rail guard caught it on
 * push, and it was RIGHT to — this codebase's failure pattern #4 is "N copies drift", and it
 * already has six independently-invented business-id resolvers.
 *
 * The migration is a CORRECTNESS GAIN, not just deduplication. withBusinessContext resolves
 * through resolveOwnerBusinessId(), which re-validates that the active-business row still
 * EXISTS, is OWNED by this user and is ACTIVE before trusting it. The inline version trusted
 * user_active_business.business_id directly — a stale or foreign row would have been believed.
 */
async function _GET(req: Request, _ctx: unknown, { businessId: bid }: BusinessContext) {
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

export const GET = withBusinessContext('aria/ask/search', _GET)
