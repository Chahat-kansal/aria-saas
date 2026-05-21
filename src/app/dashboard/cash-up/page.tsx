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

function fmt(n: number) { return 'A$' + Math.abs(n).toFixed(2) }
function fmtCents(c: number | null) { return c == null ? '—' : 'A$' + (Math.abs(c) / 100).toFixed(2) }

export default function CashUpPage() {
  const { business } = useBusinessContext()
  const [sessions, setSessions] = useState<CashSession[]>([])
  const [openSession, setOpenSession] = useState<CashSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [todaySales, setTodaySales] = useState<{ cash: number; card: number; total: number; count: number } | null>(null)
  const [drawerCount, setDrawerCount] = useState('')
  const [openingFloat, setOpeningFloat] = useState('200')
  const [closedBy, setClosedBy] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ variance: number; expected: number; actual: number } | null>(null)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const [openRes, histRes, salesRes] = await Promise.all([
        // GET open session with payment totals — /api/pos/sessions?status=open
        fetch('/api/pos/sessions?status=open').then(r => r.json()),
        // GET history — /api/pos/sessions?history=true
        fetch('/api/pos/sessions?history=true').then(r => r.json()),
        // Today's sales for the cash breakdown
        fetch('/api/pos/sales?business_id=' + business.id + '&limit=1000&since=' + today + 'T00:00:00').then(r => r.json()),
      ])
      setOpenSession(openRes.session ?? null)
      setSessions(histRes.sessions ?? [])
      if (openRes.session?.opening_float) {
        setOpeningFloat(String(Number(openRes.session.opening_float)))
      }
      const sales = ((salesRes.sales ?? []) as Array<{ total_amount: number; payment_method: string; status: string }>)
        .filter(s => s.status !== 'voided')
      const cashSales = sales.filter(s => s.payment_method === 'cash')
        .reduce((t, s) => t + Number(s.total_amount ?? 0), 0)
      const cardSales = sales.filter(s => s.payment_method !== 'cash')
        .reduce((t, s) => t + Number(s.total_amount ?? 0), 0)
      setTodaySales({ cash: cashSales, card: cardSales, total: cashSales + cardSales, count: sales.length })
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  async function submitCashUp() {
    if (!drawerCount) return
    setSubmitting(true)
    try {
      const actualCents = Math.round(parseFloat(drawerCount) * 100)
      const floatCents = Math.round(parseFloat(openingFloat || '0') * 100)
      const cashSalesCents = Math.round((todaySales?.cash ?? 0) * 100)
      const expectedCents = floatCents + cashSalesCents
      const varianceCents = actualCents - expectedCents

      if (openSession?.id) {
        // Close the open session via PATCH /api/pos/sessions?id=
        await fetch('/api/pos/sessions?id=' + openSession.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actual_cash_cents: actualCents,
            expected_cash_cents: expectedCents,
            variance_cents: varianceCents,
            closing_float: parseFloat(drawerCount),
            closed_by: closedBy || null,
            closure_note: note || null,
          }),
        })
      } else {
        // No open session — open then immediately close via sessions POST then PATCH
        const openRes = await fetch('/api/pos/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opening_float: parseFloat(openingFloat || '0') }),
        })
        const openData = await openRes.json()
        const newSessionId = openData.cashSession?.id
        if (newSessionId) {
          await fetch('/api/pos/sessions?id=' + newSessionId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              actual_cash_cents: actualCents,
              expected_cash_cents: expectedCents,
              variance_cents: varianceCents,
              closing_float: parseFloat(drawerCount),
              closed_by: closedBy || null,
              closure_note: note || null,
            }),
          })
        }
      }

      setResult({ variance: varianceCents, expected: expectedCents, actual: actualCents })
      setOpenSession(null)
      await load()
    } catch { /* ignore */ }
    setSubmitting(false)
  }

  const floatCents = Math.round(parseFloat(openingFloat || '0') * 100)
  const cashSalesCents = Math.round((todaySales?.cash ?? 0) * 100)
  const expectedCents = floatCents + cashSalesCents
  const actualCents = drawerCount ? Math.round(parseFloat(drawerCount) * 100) : null
  const previewVariance = actualCents != null ? actualCents - expectedCents : null

  const closedSessions = sessions.filter(s => s.status === 'closed')

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Daily Cash-Up</h1>
        <p style={{ fontSize: 13, color: C.muted }}>End-of-day till reconciliation — tracks variance and keeps an audit trail.</p>
        {openSession && (
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
            <span style={{ color: C.green, fontWeight: 600 }}>Register open</span>
            <span style={{ color: C.muted }}>since {new Date(openSession.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </div>

      {/* Today KPIs */}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
        {/* Cash-up form */}
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '24px' }}>
          {result ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {Math.abs(result.variance) < 100 ? '✅' : result.variance > 0 ? '📈' : '⚠️'}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Cash-up complete</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
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
              <p style={{ fontSize: 13, color: Math.abs(result.variance) < 100 ? C.green : C.amber }}>
                {Math.abs(result.variance) < 100
                  ? 'Till balanced ✓'
                  : (result.variance > 0 ? 'Till is over' : 'Till is short') + ' by ' + fmtCents(Math.abs(result.variance))}
              </p>
              <button onClick={() => { setResult(null); setDrawerCount(''); setNote('') }}
                style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                New cash-up
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>End of day reconciliation</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 5 }}>Opening float (A$)</label>
                  <input type="number" step="0.01" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 9, color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 5 }}>Actual drawer count (A$) *</label>
                  <input type="number" step="0.01" placeholder="Count your cash..."
                    value={drawerCount} onChange={e => setDrawerCount(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + (drawerCount ? C.green + '60' : C.border), borderRadius: 9, color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Live variance preview */}
              {drawerCount && (
                <div style={{ padding: '12px 16px', background: Math.abs(previewVariance ?? 0) < 100 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: '1px solid ' + (Math.abs(previewVariance ?? 0) < 100 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'), borderRadius: 10, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>Expected (float + cash sales)</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{fmtCents(expectedCents)}</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>Variance</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: Math.abs(previewVariance ?? 0) < 100 ? C.green : C.red }}>
                      {previewVariance != null ? (previewVariance >= 0 ? '+' : '') + fmtCents(previewVariance) : '—'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>Counted</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{fmtCents(actualCents)}</p>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 5 }}>Closed by</label>
                <input type="text" placeholder="Staff name" value={closedBy} onChange={e => setClosedBy(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 9, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 5 }}>Notes (variance explanation)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="e.g. Short $2.50 — likely counting error on $50 change"
                  style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 9, color: C.text, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button onClick={submitCashUp} disabled={submitting || !drawerCount}
                style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: drawerCount ? '#1D9E75' : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: drawerCount ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Saving...' : 'Complete cash-up'}
              </button>
            </>
          )}
        </div>

        {/* History */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent cash-ups</h2>
          {loading ? (
            <p style={{ color: C.muted, fontSize: 13 }}>Loading...</p>
          ) : closedSessions.length === 0 ? (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: C.muted }}>No cash-ups recorded yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {closedSessions.slice(0, 10).map(s => {
                const v = s.variance_cents ?? 0
                const balanced = Math.abs(v) < 100
                return (
                  <div key={s.id} style={{ background: C.card, border: '1px solid ' + (balanced ? C.border : 'rgba(239,68,68,0.2)'), borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                        {new Date(s.closed_at ?? s.opened_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <span style={{ fontSize: 12, fontWeight: 700, color: balanced ? C.green : C.red }}>
                        {v >= 0 ? '+' : ''}{fmtCents(v)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.dim }}>
                      Cash: {fmt(s.total_cash_sales)} · Card: {fmt(s.total_card_sales)}
                      {s.closed_by && ' · ' + s.closed_by}
                    </div>
                    {s.closure_note && (
                      <p style={{ fontSize: 11, color: C.muted, marginTop: 3, fontStyle: 'italic' }}>{s.closure_note}</p>
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
