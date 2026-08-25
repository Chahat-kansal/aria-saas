'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * MS17 PHASE 2 — conversation history, migrated from the old surface.
 *
 * BEHAVIOUR MIGRATED, NOT MARKUP: this calls the same three routes the old page called —
 * `/api/aria/ask/history` (list), `/api/aria/ask/history?id=…&messages=true` (open) and
 * `/api/aria/ask/delete` (delete). No handler was re-implemented and no new store was invented.
 *
 * It replaces the "⋯" button on the thread header, which promised thread options and did nothing.
 */

export interface ThreadSummary {
  id: string
  title: string | null
  message_count: number | null
  last_intent: string | null
  last_message_at: string | null
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

  if (!open) return null

  return (
    <div className="ax-threads" role="dialog" aria-label="Your threads">
      <div className="ax-threads-h">
        <b>Your threads</b>
        <button className="cb" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {error && <div className="ax-threads-note warn">{error}</div>}
      {!error && threads === null && <div className="ax-threads-note">Reading your threads…</div>}
      {!error && threads?.length === 0 && (
        <div className="ax-threads-note">Nothing here yet. This fills up as you talk to Aria.</div>
      )}

      {(threads ?? []).map(t => (
        <div className={t.id === activeId ? 'ax-thread on' : 'ax-thread'} key={t.id}>
          <button className="ax-thread-open" onClick={() => void openThread(t.id)} disabled={busyId === t.id}>
            <span className="t">{t.title?.trim() || 'Untitled thread'}</span>
            <span className="s">
              {t.message_count ?? 0} message{(t.message_count ?? 0) === 1 ? '' : 's'}
              {t.last_message_at ? ' · ' + when(t.last_message_at) : ''}
            </span>
          </button>
          <button
            className="cb"
            aria-label={'Delete ' + (t.title ?? 'thread')}
            onClick={() => void remove(t.id)}
            disabled={busyId === t.id}
          >🗑</button>
        </div>
      ))}
    </div>
  )
}
