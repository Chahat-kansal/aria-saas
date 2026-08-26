import type { ThreadMessage } from './conversation-branch'

/**
 * S2B PHASE 4 — finding WHICH message in a thread matched, so a search result opens in the right
 * place rather than at the top of a long conversation.
 *
 * The GIN index knows which THREAD matched — the whole conversation is one tsvector — but it cannot
 * say which message did. Doing that in SQL would mean a second, much cleverer query against the
 * JSONB array. Doing it here keeps it a pure function with a real test, and lets superseded
 * branches (S1 phases 2-3) be excluded, which SQL over the raw array could not do.
 *
 * This is a LOCATOR, not a ranker. Postgres already decided the thread matches; all this has to do
 * is point at the best line inside it, and be honest when it cannot find one.
 */

export interface MessageHit {
  /** Index into the LIVE (non-superseded) message list, or -1 when nothing specific matched. */
  index: number
  /** A short extract centred on the match, for the result row. Empty when there is no hit. */
  snippet: string
  role: string | null
}

const SNIPPET_RADIUS = 90

/** Words worth matching on: quotes stripped, operators dropped, short noise words ignored. */
export function searchTerms(query: string): string[] {
  return String(query ?? '')
    .toLowerCase()
    .replace(/["'`]/g, ' ')
    .split(/[^a-z0-9$%.\-]+/i)
    .map(t => t.replace(/^-+/, ''))          // websearch's minus-prefix is an operator, not a term
    .filter(t => t.length > 1 && t !== 'or' && t !== 'and')
}

/**
 * The message that best matches the query: the one containing the most distinct terms, earliest
 * occurrence breaking ties. Returns index -1 when no message contains any term — which happens
 * legitimately, because the thread may have matched on its TITLE.
 */
export function bestMatchingMessage(messages: ThreadMessage[], query: string): MessageHit {
  const terms = searchTerms(query)
  if (terms.length === 0) return { index: -1, snippet: '', role: null }

  let bestIdx = -1
  let bestScore = 0
  let bestAt = Number.MAX_SAFE_INTEGER

  messages.forEach((m, i) => {
    const content = String(m?.content ?? '')
    if (!content) return
    const lower = content.toLowerCase()

    let score = 0
    let firstAt = Number.MAX_SAFE_INTEGER
    for (const t of terms) {
      const at = lower.indexOf(t)
      if (at >= 0) { score++; if (at < firstAt) firstAt = at }
    }
    if (score === 0) return

    // more distinct terms wins; on a tie, the earlier occurrence
    if (score > bestScore || (score === bestScore && firstAt < bestAt)) {
      bestScore = score
      bestAt = firstAt
      bestIdx = i
    }
  })

  if (bestIdx === -1) return { index: -1, snippet: '', role: null }

  const msg = messages[bestIdx]!
  return {
    index: bestIdx,
    snippet: snippetAround(String(msg.content ?? ''), bestAt),
    role: String(msg.role ?? '') || null,
  }
}

/** A readable extract centred on the match, trimmed to word boundaries. */
export function snippetAround(content: string, at: number): string {
  const text = content.replace(/\s+/g, ' ').trim()
  if (text.length <= SNIPPET_RADIUS * 2) return text

  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(text.length, at + SNIPPET_RADIUS)
  let out = text.slice(start, end)

  // do not start or end mid-word
  if (start > 0) out = out.replace(/^\S*\s/, '')
  if (end < text.length) out = out.replace(/\s\S*$/, '')

  return (start > 0 ? '…' : '') + out.trim() + (end < text.length ? '…' : '')
}
