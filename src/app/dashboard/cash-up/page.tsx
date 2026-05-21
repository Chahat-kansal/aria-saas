'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface CashSession {
  id: string
  opened_at: string
  closed_at: string | null
  opening_float: number
  closing_float: number | null
  total_cash_sales: number
  total_card_sales: number
  total_refunds: number
  actual_cash_cents: number | null
  expected_cash_cents: number | null
  variance_cents: number | null
  status: string
  closed_by: string | null
  closure_note: string | null
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)',
}

function fmt(dollars: number) {
  return 'A$' + Math.abs(dollars).toFixed(2)
}

function fmtCents(cents: number | null) {
  if (cents == null) return '—'
  return 'A$' + Math.abs(cents / 100).toFixed(2)
}

export default function CashUpPage() {
  const { business } = useBusinessContext()
  const [sessions, setSessions] = useState<CashSession[]>([])
  const [loading, setLoading] = useState(true)
  const [todaySales, setTodaySales] = useState<{ cash: number; card: number; total: number; count: number } | null>(null)

  // End-of-day form state
  const [drawerCount, setDrawerCount] = useState('')
  const [openingFloat, setOpeningFloat] = useState('200')
  const [closedBy, setClosedBy] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<{ variance: number; expected: number; actual: number } | null>(null)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      // Load today's sales breakdown
      const today = new Date().toISOString().split('T')[0]
      const salesRes = await fetch('/api/pos/sales?business_id=' + business.id + '&limit=500&since=' + today + 'T00:00:00')
      const salesData = await salesRes.json() as { sales?: Array<{ total_amount: number; payment_method: string; status: string }> }
      const sales = (salesData.sales ?? []).filter(s => s.status !== 'voided')
      const cashSales = sales.filter(s => s.payment_method === 'cash').reduce((s, x) => s + Number(x.total_amount), 0)
      const cardSales = sales.filter(s => s.payment_method !== 'cash').reduce((s, x) => s + Number(x.total_amount), 0)
      setTodaySales({ cash: cashSales, card: cardSales, total: cashSales + cardSales, count: sales.length })

      // Load past sessions
      const res = await fetch('/api/pos/cash-sessions?business_id=' + business.id)
      const d = await res.json()
      setSessions(d.sessions ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  async function submitCashUp() {
    if (!business?.id || !drawerCount) return
    setSubmitting(true)
    try {
      const actualCents = Math.round(parseFloat(drawerCount) * 100)
      const openingFloatCents = Math.round(parseFloat(openingFloat || '0') * 100)
      const expectedCash = todaySales ? Math.round(todaySales.cash * 100) + openingFloatCents : openingFloatCents
      const varianceCents = actualCents - expectedCash

      await fetch('/api/pos/cash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          opening_float: parseFloat(openingFloat || '0'),
          closing_float: parseFloat(drawerCount),
          total_cash_sales: todaySales?.cash ?? 0,
          total_card_sales: todaySales?.card ?? 0,
          actual_cash_cents: actualCents,
          expected_cash_cents: expectedCash,
          variance_cents: varianceCents,
          closed_by: closedBy || null,
          closure_note: note || null,
          status: 'closed',
        }),
      })
      setResult({ variance: varianceCents, expected: expectedCash, actual: actualCents })
      setSubmitted(true)
      load()
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  const expectedCash = todaySales
    ? Math.round(todaySales.cash * 100) + Math.round(parseFloat(openingFloat || '0') * 100)
    : 0
  const actualCents = drawerCount ? Math.round(parseFloat(drawerCount) * 100) : null
  const previewVariance = actualCents != null ? actualCents - expectedCash : null

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Daily Cash-Up</h1>
        <p style={{ fontSize: 13, color: C.muted }}>Reconcile your till at end of day — tracks variance and keeps an audit trail.</p>
      </div>

      {/* Today's sales breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Cash sales today', value: todaySales ? fmt(todaySales.cash) : '—', color: C.green },
          { label: 'Card sales today', value: todaySales ? fmt(todaySales.card) : '—', color: '#3B82F6' },
          { label: 'Total revenue', value: todaySales ? fmt(todaySales.total) : '—', color: C.violet },
          { label: 'Transactions', value: todaySales ? String(todaySales.count) : '—', color: C.muted },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
        {/* Cash-up form */}
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '24px' }}>
          {submitted && result ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                {Math.abs(result.variance) < 100 ? '✅' : result.variance > 0 ? '📈' : '⚠️'}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Cash-up complete</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Expected', value: fmtCents(result.expected), color: C.muted },
                  { label: 'Actual', value: fmtCents(result.actual), color: C.text },
                  { label: 'Variance', value: (result.variance >= 0 ? '+' : '') + fmtCents(result.variance), color: Math.abs(result.variance) < 100 ? C.green : C.red },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px' }}>
                    <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{s.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
              {Math.abs(result.variance) < 100 && (
                <p style={{ fontSize: 13, color: C.green }}>Till balanced ✓</p>
              )}
              {Math.abs(result.variance) >= 100 && (
                <p style={{ fontSize: 13, color: C.amber }}>
                  {result.variance > 0 ? 'Till is over' : 'Till is short'} by {fmtCents(Math.abs(result.variance))} — check for missed sales or counting errors.
                </p>
              )}
              <button onClick={() => { setSubmitted(false); setDrawerCount(''); setNote('') }}
                style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                New cash-up
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>End of day reconciliation</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 6 }}>Opening float (A$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingFloat}
                    onChange={e => setOpeningFloat(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 9, color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 6 }}>Actual drawer count (A$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Count your cash..."
                    value={drawerCount}
                    onChange={e => setDrawerCount(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + (drawerCount ? C.green + '60' : C.border), borderRadius: 9, color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Live variance preview */}
              {drawerCount && (
                <div style={{ padding: '12px 16px', background: Math.abs(previewVariance ?? 0) < 100 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: '1px solid ' + (Math.abs(previewVariance ?? 0) < 100 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'), borderRadius: 10, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Expected in till</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{fmtCents(expectedCash)}</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Variance</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: Math.abs(previewVariance ?? 0) < 100 ? C.green : C.red }}>
                      {previewVariance != null ? (previewVariance >= 0 ? '+' : '') + fmtCents(previewVariance) : '—'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Counted</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{fmtCents(actualCents)}</p>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 6 }}>Closed by</label>
                <input
                  type="text"
                  placeholder="Staff name"
                  value={closedBy}
                  onChange={e => setClosedBy(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 9, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 6 }}>Notes (variance explanation, incidents)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Short A$2.50 — likely counting error on $50 change"
                  style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 9, color: C.text, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <button
                onClick={submitCashUp}
                disabled={submitting || !drawerCount}
                style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: drawerCount ? '#1D9E75' : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: drawerCount ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Saving...' : 'Complete cash-up'}
              </button>
            </>
          )}
        </div>

        {/* History */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recent cash-ups
          </h2>
          {loading ? (
            <p style={{ color: C.muted, fontSize: 13 }}>Loading...</p>
          ) : sessions.length === 0 ? (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: C.muted }}>No cash-ups recorded yet.</p>
              <p style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Complete your first end-of-day reconciliation.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.slice(0, 10).map(s => {
                const varCents = s.variance_cents ?? 0
                const isBalanced = Math.abs(varCents) < 100
                return (
                  <div key={s.id} style={{ background: C.card, border: '1px solid ' + (isBalanced ? C.border : 'rgba(239,68,68,0.2)'), borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                        {new Date(s.closed_at ?? s.opened_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </p>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isBalanced ? C.green : C.red }}>
                        {varCents >= 0 ? '+' : ''}{fmtCents(varCents)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.dim }}>
                      <span>Cash: {fmt(s.total_cash_sales)}</span>
                      <span>Card: {fmt(s.total_card_sales)}</span>
                      {s.closed_by && <span>by {s.closed_by}</span>}
                    </div>
                    {s.closure_note && (
                      <p style={{ fontSize: 11, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>{s.closure_note}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
