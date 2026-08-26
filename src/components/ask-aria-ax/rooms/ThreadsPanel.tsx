'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * Conversation history — list, open, rename, pin, delete, and search.
 *
 * BEHAVIOUR MIGRATED, NOT REBUILT (MS17): this calls the same routes the old surface called —
 * `/api/aria/ask/history` and `/api/aria/ask/delete` — plus, from S2B, `/api/aria/ask/thread`
 * (rename + pin) and `/api/aria/ask/search`.
 *
 * ⚠️ EVERY S2B ROUTE IS REACHED FROM HERE, ON PURPOSE. S1 found Stop already built and unreachable
 * because the surface never destructured `cancel`. A capability nothing calls is as broken as a
 * dead button, so rename, pin and search are wired here in the same sprint that built them.
 *
 * DELETE IS SOFT (S2B phase 2). The route writes a tombstone; the row and its messages survive.
 */

export interface ThreadSummary {
  id: string
  title: string | null
  message_count: number | null
  last_intent: string | null
  last_message_at: string | null
  pinned_at?: string | null
}

interface SearchResult {
  id: string
  title: string | null
  snippet: string
  match_index: number
  last_message_at: string | null
  pinned: boolean
}

export interface ThreadsPanelProps {
  open: boolean
  onClose: () => void
  /** Called with the conversation id and its restored messages. */
  onOpenThread: (id: string, messages: Array<{ role: string; content: string }>) => void
  /** The conversation currently on screen, so it can be marked. */
  activeId: string | null
}

function when(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', timeZone: 'Australia/Melbourne',
    })
  } catch { return '' }
}

export default function ThreadsPanel({ open, onClose, onOpenThread, activeId }: ThreadsPanelProps) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/aria/ask/history')
      if (!res.ok) throw new Error('Could not read your threads')
      const data = await res.json() as { conversations?: ThreadSummary[] }
      setThreads(data.conversations ?? [])
    } catch (e) {
      // A failed read says so. It never renders as "no threads yet".
      setError((e as Error).message)
      setThreads(null)
    }
  }, [])

  useEffect(() => { if (open) void load() }, [open, load])

  // ── search ────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); return }
    let cancelled = false
    setSearching(true)
    // debounced: a search per keystroke would be a query per keystroke
    const t = setTimeout(() => {
      fetch('/api/aria/ask/search?q=' + encodeURIComponent(q))
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('Search is unavailable just now'))))
        .then((d: { results?: SearchResult[] }) => { if (!cancelled) setResults(d.results ?? []) })
        .catch(e => { if (!cancelled) { setError((e as Error).message); setResults([]) } })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  const openThread = useCallback(async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/aria/ask/history?id=${encodeURIComponent(id)}&messages=true`)
      const data = await res.json() as { conversation?: { messages?: Array<{ role: string; content: string }> } }
      onOpenThread(id, data.conversation?.messages ?? [])
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusyId(null) }
  }, [onClose, onOpenThread])

  const remove = useCallback(async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch('/api/aria/ask/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('That thread could not be deleted')
      setThreads(prev => (prev ?? []).filter(t => t.id !== id))
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusyId(null) }
  }, [])

  /** Rename or pin — one route, one shape. */
  const patchThread = useCallback(async (id: string, patch: { title?: string; pinned?: boolean }) => {
    setBusyId(id)
    try {
      const res = await fetch('/api/aria/ask/thread', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(b.error ?? 'That change could not be saved')
      }
      const { thread } = await res.json() as { thread: ThreadSummary }
      setThreads(prev => {
        const next = (prev ?? []).map(t => (t.id === id ? { ...t, ...thread } : t))
        // pinned first, then most recent — the same order the list route returns
        return next.sort((a, b) => {
          if (Boolean(a.pinned_at) !== Boolean(b.pinned_at)) return a.pinned_at ? -1 : 1
          return String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? ''))
        })
      })
      setRenaming(null)
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusyId(null) }
  }, [])

  if (!open) return null

  const showingSearch = results !== null

  return (
    <div className="ax-threads" role="dialog" aria-label="Your threads">
      <div className="ax-threads-h">
        <b>Your threads</b>
        <button className="cb" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <input
        className="ax-thread-search"
        placeholder="Search your conversations…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Search your conversations"
      />

      {error && <div className="ax-threads-note warn">{error}</div>}

      {/* ── search results ── */}
      {showingSearch && (
        <>
          {searching && <div className="ax-threads-note">Searching…</div>}
          {!searching && results.length === 0 && (
            <div className="ax-threads-note">Nothing matched “{query.trim()}”.</div>
          )}
          {results.map(r => (
            <div className="ax-thread" key={'s' + r.id}>
              <button className="ax-thread-open" onClick={() => void openThread(r.id)} disabled={busyId === r.id}>
                <span className="t">{r.pinned ? '📌 ' : ''}{r.title?.trim() || 'Untitled thread'}</span>
                <span className="s">{r.snippet || when(r.last_message_at)}</span>
              </button>
            </div>
          ))}
        </>
      )}

      {/* ── the list ── */}
      {!showingSearch && (
        <>
          {!error && threads === null && <div className="ax-threads-note">Reading your threads…</div>}
          {!error && threads?.length === 0 && (
            <div className="ax-threads-note">Nothing here yet. This fills up as you talk to Aria.</div>
          )}

          {(threads ?? []).map(t => (
            <div className={t.id === activeId ? 'ax-thread on' : 'ax-thread'} key={t.id}>
              {renaming?.id === t.id ? (
                <input
                  className="ax-thread-rename"
                  value={renaming.title}
                  autoFocus
                  onChange={e => setRenaming({ id: t.id, title: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); void patchThread(t.id, { title: renaming.title }) }
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  onBlur={() => setRenaming(null)}
                />
              ) : (
                <>
                  <button className="ax-thread-open" onClick={() => void openThread(t.id)} disabled={busyId === t.id}>
                    <span className="t">{t.pinned_at ? '📌 ' : ''}{t.title?.trim() || 'Untitled thread'}</span>
                    <span className="s">
                      {t.message_count ?? 0} message{(t.message_count ?? 0) === 1 ? '' : 's'}
                      {t.last_message_at ? ' · ' + when(t.last_message_at) : ''}
                    </span>
                  </button>
                  <button
                    className="cb"
                    aria-label={t.pinned_at ? 'Unpin' : 'Pin'}
                    disabled={busyId === t.id}
                    onClick={() => void patchThread(t.id, { pinned: !t.pinned_at })}
                  >{t.pinned_at ? '📌' : '📍'}</button>
                  <button
                    className="cb"
                    aria-label={'Rename ' + (t.title ?? 'thread')}
                    disabled={busyId === t.id}
                    onClick={() => setRenaming({ id: t.id, title: t.title ?? '' })}
                  >✎</button>
                  <button
                    className="cb"
                    aria-label={'Delete ' + (t.title ?? 'thread')}
                    onClick={() => void remove(t.id)}
                    disabled={busyId === t.id}
                  >🗑</button>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
