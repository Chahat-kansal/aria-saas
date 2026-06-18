// API-RESILIENCE-1B — cached last-good answer.
//
// When ALL AI providers are down, the very last resort (before a plain terminal message) is to serve
// the most recent SUCCESSFUL answer to a similar question from aria_conversations — clearly labelled
// as cached + timestamped. It was real, grounded data when generated; the staleness label is mandatory
// (the live numbers may have moved). We never present cached as live.
import { supabaseAdmin } from '@/lib/supabase-admin'

// Low-value words ignored when comparing questions (so overlap reflects the actual subject).
const STOP = new Set([
  'the', 'a', 'an', 'my', 'me', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'what', 'whats',
  'how', 'can', 'you', 'tell', 'show', 'give', 'for', 'and', 'or', 'this', 'that', 'it', 'its',
  'your', 'please', 'aria', 'about', 'with', 'have', 'has', 'get', 'into', 'from', 'any', 'all',
])

function terms(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length >= 3 && !STOP.has(w)))
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago')
  const h = Math.floor(m / 60)
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago')
  const d = Math.floor(h / 24)
  return d + (d === 1 ? ' day ago' : ' days ago')
}

// Don't serve an answer that was itself a degraded/outage reply (no stale-of-stale).
function isUsableAnswer(a: string): boolean {
  if (!a || a.trim().length < 20) return false
  return !/all ai providers|temporarily offline|briefly offline|briefly unavailable|providers are all|temporarily unavailable/i.test(a)
}

/** Find the most recent successful answer to a question similar to `question` for this business,
 *  within the last 24h. Returns null when nothing relevant matches. */
export async function findCachedAnswer(
  businessId: string,
  question: string,
): Promise<{ answer: string; relative: string } | null> {
  try {
    const qTerms = terms(question)
    if (qTerms.size === 0) return null

    const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data } = await supabaseAdmin
      .from('aria_conversations')
      .select('messages, last_message_at')
      .eq('business_id', businessId)
      .gte('last_message_at', sinceIso)
      .order('last_message_at', { ascending: false })
      .limit(25)
    if (!data || data.length === 0) return null

    let best: { answer: string; relative: string; score: number } | null = null
    for (const row of data as Array<{ messages: unknown; last_message_at: string }>) {
      const msgs = Array.isArray(row.messages) ? (row.messages as Array<{ role?: string; content?: string }>) : []
      // Pull the last assistant answer and the user question that preceded it.
      let answer = ''
      let userQ = ''
      for (let i = msgs.length - 1; i >= 0; i--) {
        const role = msgs[i]?.role
        const content = msgs[i]?.content
        if (typeof content !== 'string') continue
        if (!answer && role === 'assistant') answer = content
        else if (answer && role === 'user') { userQ = content; break }
      }
      if (!isUsableAnswer(answer) || !userQ) continue

      const uTerms = terms(userQ)
      let shared = 0
      for (const t of qTerms) if (uTerms.has(t)) shared++
      // Normalise by the smaller term set so short, focused questions still score well.
      const score = shared / Math.max(1, Math.min(qTerms.size, uTerms.size))
      // Require a real subject overlap: >=2 shared significant terms AND >=30% of the smaller set.
      if (shared >= 2 && score >= 0.3 && (!best || score > best.score)) {
        best = { answer, relative: relativeTime(row.last_message_at), score }
      }
    }
    return best ? { answer: best.answer, relative: best.relative } : null
  } catch (e) {
    console.error('[cached-answer] lookup failed:', (e as Error).message)
    return null
  }
}
