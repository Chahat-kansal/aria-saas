'use client'
import { useCallback, useEffect, useState } from 'react'
import { SaveToFilesButton } from '@/components/dashboard/SaveToFilesButton'

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
  /** S8 PHASE 3 — the record a click came from, when there is one. */
  onPrompt: (prompt: string, noticeRef?: { id: string; source: 'aria_action' | 'deliverable' }) => void
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
  // S9 PHASE 3 — per-deliverable schedule state, keyed by id so two cards cannot share a draft.
  const [schedOpen, setSchedOpen] = useState<string | null>(null)
  const [schedEmail, setSchedEmail] = useState<Record<string, string>>({})
  const [schedFreq, setSchedFreq] = useState<Record<string, 'daily' | 'weekly'>>({})

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

  /**
   * S9 PHASE 3 (#6) — SCHEDULE A RECURRING DELIVERY. Migrated from classic's DeliverableToolbar
   * (classic/page.tsx:404 saveSchedule), same route, same payload shape. `aria_scheduled_reports`
   * has one real row, so this is a live capability that the default surface simply could not reach.
   *
   * The recipient is the owner's OWN address, typed by them, and nothing is sent from here — this
   * only records the schedule. Actually sending is the cron's job and was never on this surface.
   */
  const schedule = useCallback(async (d: Deliverable) => {
    const email = (schedEmail[d.id] ?? '').trim()
    if (!email) { setNote('Enter the address the report should go to.'); return }
    setBusy(d.id); setNote(null)
    try {
      const res = await fetch('/api/aria/intelligence/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: d.title,
          report_type: 'deliverable',
          frequency: schedFreq[d.id] ?? 'weekly',
          recipients: [email],
          deliverable_spec: { task_prompt: d.title, output_kind: d.output_kind },
        }),
      })
      // RULE 7 — the response is read, never assumed. A 200 that says "error" is still an error.
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setNote(data.error ?? 'That schedule could not be saved.'); return }
      setNote('Scheduled — ' + (schedFreq[d.id] ?? 'weekly') + ' to ' + email)
      setSchedOpen(null)
    } catch (e) {
      setNote((e as Error).message)
    } finally { setBusy(null) }
  }, [schedEmail, schedFreq])

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
            {/* S9 PHASE 3 (#6) — the SAME shared component classic uses, with the same props it
                passes there (classic/page.tsx:469). Not a reimplementation: `grounding="verified"`
                because a deliverable's numbers come from live pos_* queries via deliverables.ts,
                not from an estimate. */}
            <SaveToFilesButton
              className="gh"
              sourceKind="ask_aria_deliverable"
              sourceId={d.id}
              title={d.title ?? 'Untitled'}
              grounding="verified"
            />
            <button className="gh" onClick={() => setSchedOpen(v => v === d.id ? null : d.id)}>
              Schedule
            </button>
            {/* EMAIL IS DELIBERATELY NOT HERE. classic's toolbar also has a "Email" button
                (/api/aria/deliverable-email). Sending is on the PARK list, so it stays on
                /classic and is named in the run log rather than migrated quietly. */}
            <button
              className="gh"
              onClick={() => onPrompt(`Tell me about "${d.title ?? 'this report'}"`,
                { id: d.id, source: 'deliverable' })}
            >
              Ask about it
            </button>
          </span>
          {schedOpen === d.id && (
            <div className="ax-sched">
              <label className="ax-sched-l" htmlFor={'sched-email-' + d.id}>Send it to</label>
              <input
                id={'sched-email-' + d.id}
                type="email"
                className="ax-sched-in"
                placeholder="you@yourcafe.com.au"
                value={schedEmail[d.id] ?? ''}
                onChange={e => setSchedEmail(v => ({ ...v, [d.id]: e.target.value }))}
              />
              <select
                className="ax-sched-in"
                aria-label="How often"
                value={schedFreq[d.id] ?? 'weekly'}
                onChange={e => setSchedFreq(v => ({ ...v, [d.id]: e.target.value as 'daily' | 'weekly' }))}
              >
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
              <button className="go" onClick={() => void schedule(d)} disabled={busy === d.id}>
                {busy === d.id ? 'Saving…' : 'Schedule it'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
