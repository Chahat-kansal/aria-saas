import { toNullableUuid } from '@/lib/utils/uuid-helpers'

/**
 * M11 PHASE 1 — WHAT A RELOAD MUST CARRY.
 *
 * ── THE DEFECT THIS FIXES ──────────────────────────────────────────────────────────────────────
 * `AskAriaTransition` held the open thread in `useState` alone. Nothing outside React memory knew
 * which conversation was open, so a refresh dropped the owner back on the welcome screen. The
 * conversation was never lost — `aria_conversations` had it and the Threads panel could reopen it —
 * but the owner had to know to go and look. Every persistence layer this needs already existed
 * (S2 schema, S2B `/api/aria/ask/history?id=&messages=true`, S3 provenance round-trip); the only
 * missing piece was the THREAD'S IDENTITY surviving the reload, which is what this module is.
 *
 * ── WHY THE URL, AND NOT A SECOND STORE ────────────────────────────────────────────────────────
 * A conversation id in the address bar is the smallest thing that can carry identity across a
 * reload, and it comes with a second property for free: the conversation becomes linkable. A
 * localStorage "last thread" key would restore the same thread in every tab, would resurrect a
 * thread the owner had deliberately left, and could not be shared. The URL is the record.
 *
 * ── AND WHY THIS DOES NOT MAKE ANYTHING NEWLY VISIBLE ──────────────────────────────────────────
 * The id is not a capability. `/api/aria/ask/history` filters every read by the caller's own
 * business_id and excludes tombstones (see its header). Pasting somebody else's conversation id
 * returns `{ conversation: null }`, and `restoreThread` below turns that into the welcome screen,
 * not an error and not a leak. Nothing here changes what a caller may read.
 */

/** The query key. `q` is the one-shot question; `c` is the durable thread identity. */
export const THREAD_PARAM = 'c'

/** sessionStorage prefix for "how far down this thread the owner had scrolled". */
const SCROLL_PREFIX = 'aria:scroll:'

/**
 * The thread id in a query string, or null.
 *
 * Validated as a UUID with the codebase's EXISTING helper rather than a fifth copy of the same
 * regex (`toNullableUuid` — resolve-business.ts, resolve-code.ts and notice-context.ts each carry
 * their own; four is already too many). A non-UUID `?c=` is treated as absent, so a mangled or
 * hand-edited link opens the welcome screen instead of putting a junk id on the wire.
 */
export function readThreadId(search: string): string | null {
  try {
    return toNullableUuid(new URLSearchParams(search).get(THREAD_PARAM))
  } catch {
    return null
  }
}

/**
 * The query string a URL should carry once `id` is the open thread.
 *
 * ⚠️ IT REMOVES `q`. This is the whole reason this is a function and not a one-liner at the call
 * site. `?q=` auto-sends on load (S5 phase 4), so leaving it beside `?c=` would mean every reload
 * of a conversation that STARTED from a briefing link re-asked the question and billed for it —
 * the same "a reload repeats an action" class M4 fixed on the send path. A thread URL asks nothing.
 */
export function threadSearch(id: string | null, currentSearch: string): string {
  const p = new URLSearchParams(currentSearch)
  p.delete('q')
  if (id) p.set(THREAD_PARAM, id)
  else p.delete(THREAD_PARAM)
  const s = p.toString()
  return s ? '?' + s : ''
}

/**
 * Put the open thread in the address bar without navigating.
 *
 * `replaceState`, never `push`: a push per send would fill the back button with one entry per
 * message, and Back would then walk backwards through a conversation the owner never left. The URL
 * is still copyable and still reloads to the right place, which is the point.
 */
export function syncThreadUrl(id: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return
    const next = threadSearch(id, window.location.search)
    if (next === window.location.search) return
    window.history.replaceState(null, '', window.location.pathname + next + window.location.hash)
  } catch { /* an address bar that will not update must never break the conversation */ }
}

export interface RestoredThread {
  id: string
  messages: Array<{ role: string; content: string; provenance?: { anchors: number[]; anchorLabels?: Record<string, string> } }>
}

type Fetcher = (input: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

/**
 * Fetch a thread by id for a reload.
 *
 * Uses the SAME route and the SAME shape the Threads panel already uses to reopen a conversation —
 * `/api/aria/ask/history?id=…&messages=true` — so a restored-by-URL thread and a restored-by-click
 * thread cannot drift apart. There is deliberately no second endpoint.
 *
 * Returns null for every "we should show the welcome screen" case: not found, not this business's,
 * deleted, unauthorised, offline, or a thread with no messages. A null is not an error state — a
 * stale link is an ordinary thing to click.
 */
export async function restoreThread(id: string, fetchImpl: Fetcher): Promise<RestoredThread | null> {
  const clean = toNullableUuid(id)
  if (!clean) return null
  try {
    const res = await fetchImpl('/api/aria/ask/history?id=' + encodeURIComponent(clean) + '&messages=true')
    if (!res.ok) return null
    const data = await res.json() as { conversation?: { id?: string; messages?: RestoredThread['messages'] } | null }
    const conv = data && data.conversation
    if (!conv) return null
    const messages = Array.isArray(conv.messages) ? conv.messages : []
    // An empty thread restores to nothing: putting the owner in an empty WORKING screen with no
    // messages is a worse answer than the welcome screen they would otherwise have got.
    if (messages.length === 0) return null
    return { id: clean, messages }
  } catch {
    return null
  }
}

/**
 * Remember how far down a thread the owner had scrolled.
 *
 * sessionStorage, not local: "where I was reading" is true for this tab and this sitting. It should
 * not follow the owner to tomorrow morning, and it should not be shared between two tabs open on
 * two different points of the same conversation.
 */
export function rememberScroll(id: string | null, top: number): void {
  if (!id) return
  try {
    if (!Number.isFinite(top) || top < 0) return
    sessionStorage.setItem(SCROLL_PREFIX + id, String(Math.round(top)))
  } catch { /* scroll memory is a convenience, never a requirement */ }
}

/** The remembered offset, or null when there is none (→ the caller falls back to the bottom). */
export function recallScroll(id: string | null): number | null {
  if (!id) return null
  try {
    const raw = sessionStorage.getItem(SCROLL_PREFIX + id)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function forgetScroll(id: string | null): void {
  if (!id) return
  try { sessionStorage.removeItem(SCROLL_PREFIX + id) } catch { /* as above */ }
}
