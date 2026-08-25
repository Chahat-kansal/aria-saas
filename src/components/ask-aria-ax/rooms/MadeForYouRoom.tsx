'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * MS17 PHASE 2 — the "Made for you" room: the deliverables Aria has produced.
 *
 * BEHAVIOUR MIGRATED, NOT MARKUP: same routes the old surface used —
 * `/api/aria/deliverables` (list) and `/api/aria/deliverable-pdf` (export).
 *
 * WHY THIS TAB IS LEGITIMATE DESPITE STALE DATA: `aria_task_outputs` holds 26 rows, newest 17 June,
 * which looks abandoned. It is not — "Save to Files" writes to it today, owner-triggered, via
 * /api/canopy/reports → canopy-reports.ts:65. Stale rows, live writer, so the emptiness (when it is
 * empty) is real rather than structural.
 *
 * ⚠️ EMAIL IS DELIBERATELY ABSENT. The old surface could email a deliverable
 * (`/api/aria/deliverable-email`). That route SENDS a message to a person, and the sprint's decision
 * table parks any control that sends. The route still exists and the old page still offers it; this
 * room does not. See RUN-MS17.md.
 */

interface Deliverable {
  id: string
  title: string | null
  output_kind: string | null
  status: string | null
  created_at: string | null
}

export interface MadeForYouRoomProps {
  onPrompt: (prompt: string) => void
}

function when(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne',
    })
  } catch { return '' }
}

export default function MadeForYouRoom({ onPrompt }: MadeForYouRoomProps) {
  const [items, setItems] = useState<Deliverable[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/aria/deliverables')
      .then(r => { if (!r.ok) throw new Error('Could not read what Aria has made'); return r.json() })
      .then((d: { deliverables?: Deliverable[] }) => { if (!cancelled) setItems(d.deliverables ?? []) })
      // A failed read is stated, never smoothed into "nothing here yet".
      .catch(e => { if (!cancelled) { setError((e as Error).message); setItems(null) } })
    return () => { cancelled = true }
  }, [])

  const pdf = useCallback(async (id: string) => {
    setBusy(id); setNote(null)
    try {
      const res = await fetch('/api/aria/deliverable-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId: id }),
      })
      const data = await res.json() as { pdf_url?: string; error?: string }
      if (data.pdf_url) window.open(data.pdf_url, '_blank')
      else setNote(data.error ?? 'That PDF could not be produced.')
    } catch (e) {
      setNote((e as Error).message)
    } finally { setBusy(null) }
  }, [])

  return (
    <div className="ax-room">
      <div className="ax-room-h">Made for you{items ? <span>{items.length}</span> : null}</div>

      {error && <div className="ax-room-note warn">{error}</div>}
      {!error && items === null && <div className="ax-room-note">Reading…</div>}
      {!error && items?.length === 0 && (
        <div className="ax-room-note">
          Nothing yet. Reports you save from a dashboard land here.
        </div>
      )}
      {note && <div className="ax-room-note warn">{note}</div>}

      {(items ?? []).map(d => (
        <div className="nt" key={d.id}>
          <span className="p c" />
          <span>
            <span className="h">{d.title?.trim() || 'Untitled'}</span>
            <span className="s">
              {(d.output_kind ?? 'report').replace(/_/g, ' ')}{d.created_at ? ' · ' + when(d.created_at) : ''}
            </span>
          </span>
          <span className="ax-room-acts">
            <button className="gh" onClick={() => void pdf(d.id)} disabled={busy === d.id}>
              {busy === d.id ? 'Working…' : 'PDF'}
            </button>
            <button className="gh" onClick={() => onPrompt(`Tell me about "${d.title ?? 'this report'}"`)}>
              Ask about it
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
