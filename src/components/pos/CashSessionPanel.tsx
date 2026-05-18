'use client'
import { useState, useEffect, useCallback } from 'react'
import { computeExpectedCashCents, computeVarianceCents, classifyVariance } from '@/lib/pos/cash-session-engine'

interface CashSession {
  id: string
  status: string
  opening_float: number
  opened_at: string
  opened_by: string
  notes: string | null
  total_cash_sales?: number
  expected_cash_cents?: number
  actual_cash_cents?: number
  variance_cents?: number
}

interface Props {
  registerId?: string
  outletId?: string
  onSessionClosed?: (sessionId: string) => void
}

export default function CashSessionPanel({ registerId, outletId, onSessionClosed }: Props) {
  const [session, setSession] = useState<CashSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [openingFloat, setOpeningFloat] = useState('0.00')
  const [openNotes, setOpenNotes] = useState('')
  const [opening, setOpening] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [actualCash, setActualCash] = useState('')
  const [closureNote, setClosureNote] = useState('')
  const [closedByName, setClosedByName] = useState('')
  const [closing, setClosing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (registerId) params.set('register_id', registerId)
    if (outletId) params.set('outlet_id', outletId)
    const r = await fetch(`/api/pos/cash-sessions?${params}`)
    if (r.ok) {
      const d = await r.json()
      setSession(d.active_session ?? null)
    }
    setLoading(false)
  }, [registerId, outletId])
  useEffect(() => { load() }, [load])

  async function openSession() {
    setOpening(true)
    const r = await fetch('/api/pos/cash-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0, register_id: registerId, outlet_id: outletId, notes: openNotes || null }),
    })
    setOpening(false)
    if (r.ok) { load() } else { const d = await r.json(); alert(d.error ?? 'Failed to open session') }
  }

  async function closeSession() {
    if (!session) return
    const actualCents = Math.round(parseFloat(actualCash) * 100) || 0
    setClosing(true)
    const r = await fetch(`/api/pos/cash-sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_cash_cents: actualCents, closure_note: closureNote, closed_by_name: closedByName }),
    })
    setClosing(false)
    if (r.ok) {
      setCloseOpen(false)
      onSessionClosed?.(session.id)
      load()
    } else {
      const d = await r.json(); alert(d.error ?? 'Failed to close session')
    }
  }

  // Live variance preview
  const expectedCents = session
    ? computeExpectedCashCents(Number(session.opening_float) || 0, Number(session.total_cash_sales) || 0, 0)
    : 0
  const actualCents = Math.round(parseFloat(actualCash) * 100) || 0
  const varianceCents = computeVarianceCents(expectedCents, actualCents)
  const classification = classifyVariance(varianceCents, Number(session?.total_cash_sales) || 0)
  const varianceColor = varianceCents === 0 ? '#7FB897' : classification.includes('significant') ? '#FF6B6B' : '#FFB347'

  if (loading) return <div className="text-sm p-4" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading session…</div>

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
      {!session ? (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Open till</h2>
          <div className="space-y-2 mb-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Opening float (A$)</label>
              <input type="number" step="0.01" min={0} value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Notes (optional)</label>
              <input value={openNotes} onChange={e => setOpenNotes(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
            </div>
          </div>
          <button onClick={openSession} disabled={opening} className="w-full py-2 rounded-xl text-sm font-semibold" style={{ background: '#2D5240', color: '#7FB897' }}>
            {opening ? 'Opening…' : 'Open till'}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Till open</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(127,184,151,0.15)', color: '#7FB897' }}>Active</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            {[
              ['Opened', new Date(session.opened_at).toLocaleTimeString()],
              ['Float', `A$${(Number(session.opening_float) || 0).toFixed(2)}`],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{k}</div>
                <div className="font-medium" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setCloseOpen(true)} className="w-full py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,107,107,0.12)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.2)' }}>
            Close till
          </button>
        </div>
      )}

      {closeOpen && session && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCloseOpen(false)}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid rgba(127,184,151,0.2)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Close till</h2>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Actual cash in till (A$)</label>
                <input type="number" step="0.01" min={0} value={actualCash} onChange={e => setActualCash(e.target.value)} autoFocus className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
              </div>
              {actualCash && (
                <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${varianceColor}33` }}>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Expected</span>
                    <span style={{ color: 'var(--text-primary, #E8EDE7)' }}>A${(expectedCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Variance</span>
                    <span style={{ color: varianceColor }}>{varianceCents >= 0 ? '+' : ''}${(varianceCents / 100).toFixed(2)} ({classification.replace(/_/g, ' ')})</span>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Closed by</label>
                <input value={closedByName} onChange={e => setClosedByName(e.target.value)} placeholder="Your name" className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Closure note (optional)</label>
                <input value={closureNote} onChange={e => setClosureNote(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCloseOpen(false)} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={closeSession} disabled={closing} className="flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: '#2D5240', color: '#7FB897' }}>
                {closing ? 'Closing…' : 'Close till'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
