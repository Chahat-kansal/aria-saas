'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

// I11 COUNTERFACTUAL Part 2 — surface the hypothesis backlog the nightly engine generates (the
// owner never saw these). Accept creates a linked aria_action + arms I4 outcome tracking; Reject
// records the reason. Reuses the existing /api/aria/hypotheses endpoints — no new write paths.

interface Hypothesis {
  id: string
  title: string
  description: string
  category: string
  predicted_impact_cents: number | null
  predicted_impact_label: string | null
  risk_level: string
  confidence: number
  status: string
  generated_at: string
  outcome_verdict: string | null
}

type SortKey = 'confidence' | 'impact' | 'category'

const RISK_COLOR: Record<string, string> = { low: '#7FB897', medium: '#E0A458', high: '#E06A58' }

export default function HypothesesPage() {
  const { business } = useBusinessContext()
  const bid = business?.id
  const [items, setItems] = useState<Hypothesis[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('confidence')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    try {
      const res = await fetch('/api/aria/hypotheses?business_id=' + bid)
      const json = res.ok ? await res.json() : { hypotheses: [] }
      setItems((json.hypotheses ?? []) as Hypothesis[])
    } finally {
      setLoading(false)
    }
  }, [bid])

  useEffect(() => { void load() }, [load])

  const act = useCallback(async (id: string, status: 'accepted' | 'rejected') => {
    setBusyId(id)
    try {
      const body: Record<string, unknown> = { status }
      if (status === 'rejected') body.rejection_reason = 'Dismissed by owner from hypotheses board'
      const res = await fetch('/api/aria/hypotheses/' + id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) setItems(prev => prev.map(h => h.id === id ? { ...h, status } : h))
    } finally {
      setBusyId(null)
    }
  }, [])

  const open = useMemo(() => items.filter(h => h.status === 'active' || h.status === 'interactive_counterfactual'), [items])
  const decided = useMemo(() => items.filter(h => h.status === 'accepted' || h.status === 'rejected'), [items])

  const sorted = useMemo(() => {
    const arr = [...open]
    arr.sort((a, b) => {
      if (sort === 'confidence') return Number(b.confidence) - Number(a.confidence)
      if (sort === 'impact') return (b.predicted_impact_cents ?? 0) - (a.predicted_impact_cents ?? 0)
      return String(a.category).localeCompare(String(b.category))
    })
    return arr
  }, [open, sort])

  if (!bid) return <div style={{ padding: 40, color: 'rgba(255,255,255,0.6)' }}>Select a business to see hypotheses.</div>

  return (
    <div style={{ padding: '32px 28px', maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>Hypotheses</h1>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, margin: '0 0 22px' }}>
        Testable ideas Aria generated from your data. Accept one to act on it (Aria tracks the outcome), or dismiss it.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Sort by</span>
        {(['confidence', 'impact', 'category'] as SortKey[]).map(k => (
          <button key={k} onClick={() => setSort(k)} style={{
            padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
            border: sort === k ? '1px solid rgba(127,184,151,0.5)' : '1px solid rgba(255,255,255,0.1)',
            background: sort === k ? 'rgba(127,184,151,0.15)' : 'transparent',
            color: sort === k ? '#7FB897' : 'rgba(255,255,255,0.5)',
          }}>{k}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading hypotheses…</div>
      ) : sorted.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '24px 0' }}>
          No open hypotheses right now — Aria generates fresh ones nightly from your latest data.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sorted.map(h => (
            <div key={h.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, textTransform: 'capitalize', color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.06)', padding: '3px 9px', borderRadius: 999 }}>{h.category}</span>
                <span style={{ fontSize: 11, color: RISK_COLOR[h.risk_level] ?? '#999', border: `1px solid ${RISK_COLOR[h.risk_level] ?? '#999'}55`, padding: '3px 9px', borderRadius: 999 }}>{h.risk_level} risk</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{Math.round(Number(h.confidence) * 100)}% confidence</span>
                {h.predicted_impact_label && (
                  <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#7FB897' }}>{h.predicted_impact_label}</span>
                )}
              </div>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>{h.title}</h3>
              {expanded[h.id] && (
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 10px', lineHeight: 1.55 }}>{h.description}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <button onClick={() => act(h.id, 'accepted')} disabled={busyId === h.id} style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: busyId === h.id ? 'default' : 'pointer', opacity: busyId === h.id ? 0.6 : 1,
                }}>Accept</button>
                <button onClick={() => act(h.id, 'rejected')} disabled={busyId === h.id} style={{
                  padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
                  color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: busyId === h.id ? 'default' : 'pointer',
                }}>Dismiss</button>
                <button onClick={() => setExpanded(p => ({ ...p, [h.id]: !p[h.id] }))} style={{
                  marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: 'none', background: 'transparent',
                  color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer',
                }}>{expanded[h.id] ? 'Hide' : 'Details'}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '0 0 10px' }}>Recently decided</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {decided.slice(0, 8).map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                <span style={{ color: h.status === 'accepted' ? '#7FB897' : 'rgba(255,255,255,0.35)' }}>{h.status === 'accepted' ? '✓ Accepted' : '✕ Dismissed'}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{h.title}</span>
                {h.outcome_verdict && <span style={{ marginLeft: 'auto', fontSize: 11 }}>outcome: {h.outcome_verdict}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
