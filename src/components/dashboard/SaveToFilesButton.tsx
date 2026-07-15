'use client'
import { useState } from 'react'

// CANOPY-REPORTS-AS-FILES-1 — one shared "Save to Files" action for every report/deliverable
// surface (Ask Aria, Weekly Reports, Profit Leaks, Daily Briefing), instead of four bespoke fetch
// call sites. Always an explicit owner click (saved_by defaults to 'owner' server-side) — no
// autonomous Aria-triggered save exists yet to wire a different value from here.
export interface SaveToFilesProps {
  sourceKind: 'ask_aria_deliverable' | 'weekly_report' | 'daily_briefing' | 'profit_leaks'
  sourceId?: string | null
  title: string
  grounding: 'verified' | 'derived' | 'estimated'
  /** Required when sourceKind has no existing generated PDF row of its own (daily_briefing,
   * profit_leaks) — the report content to persist + PDF via the reused deliverable pipeline. */
  html?: string | null
  className?: string
  style?: React.CSSProperties
  label?: string
}

export function SaveToFilesButton({ sourceKind, sourceId, title, grounding, html, className, style, label }: SaveToFilesProps) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function save() {
    setState('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/canopy/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId ?? undefined, title, grounding, html: html ?? undefined }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setState('error'); setErrorMsg(data.error ?? 'Save failed'); return }
      setState('saved')
      setTimeout(() => setState('idle'), 2500)
    } catch (e) {
      setState('error')
      setErrorMsg((e as Error).message)
    }
  }

  return (
    <button onClick={save} disabled={state === 'saving'} className={className} style={style} title={errorMsg || undefined}>
      {state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved to Files' : state === 'error' ? '⚠ Save failed' : (label ?? 'Save to Files')}
    </button>
  )
}
