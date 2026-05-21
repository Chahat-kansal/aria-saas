'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'rgba(255,255,255,0.07)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' }
const CATEGORY_ICON: Record<string, string> = { INVENTORY: '📦', STAFFING: '👥', CUSTOMERS: '👤', PROMOTIONS: '💸', SOCIAL: '📱', FINANCE: '💰', COMPLIANCE: '⚖️', GENERAL: '⚡' }
const PRIORITY_COLOR = {
  urgent:    { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  accent: '#EF4444', label: '🔴 URGENT' },
  important: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', accent: '#F59E0B', label: '🟡 IMPORTANT' },
  routine:   { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  accent: '#22C55E', label: '🟢 ROUTINE' },
}

interface AutopilotAction {
  id: string; category: string; priority: string; title: string; description: string
  estimated_impact: string | null; status: string; created_at: string
  approved_at?: string; executed_at?: string
  outcome_note?: string | null; outcome_revenue_cents?: number | null
}

export default function AutopilotPage() {
  const { business } = useBusinessContext()
  const [actions, setActions] = useState<AutopilotAction[]>([])
  const [history, setHistory] = useState<AutopilotAction[]>([])
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [stats, setStats] = useState({ approved: 0, rejected: 0, executed: 0, pending: 0 })
  // Outcome tracking state
  const [editingOutcome, setEditingOutcome] = useState<string | null>(null)
  const [outcomeNote, setOutcomeNote] = useState('')
  const [outcomeRevenue, setOutcomeRevenue] = useState('')
  const [savingOutcome, setSavingOutcome] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const bid = business?.id ? '?business_id=' + business.id : ''
    try {
      const [pendingRes, histRes] = await Promise.all([
        fetch('/api/aria/autopilot?status=pending' + (business?.id ? '&business_id=' + business.id : '')).then(r => r.json()),
        fetch('/api/aria/autopilot?status=approved' + (business?.id ? '&business_id=' + business.id : '')).then(r => r.json()),
      ])
      const pendingActions: AutopilotAction[] = pendingRes.actions ?? []
      const histActions: AutopilotAction[] = histRes.actions ?? []
      setActions(pendingActions)
      setHistory(histActions)
      setStats({ pending: pendingActions.length, approved: histActions.filter(a => a.approved_at).length, rejected: 0, executed: histActions.filter(a => a.executed_at).length })
    } catch { setError('Could not load actions') }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  async function runAnalysis() {
    setRunning(true); setError(null)
    try {
      const res = await fetch('/api/aria/autopilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business?.id }) })
      const d = await res.json()
      if (!res.ok || d.error) { setError(d.error || 'Analysis failed'); setRunning(false); return }
      setLastRun(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }))
      await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    setRunning(false)
  }

  async function updateAction(id: string, status: string) {
    const res = await fetch('/api/aria/autopilot?id=' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    const d = await res.json()
    if (d.action) { setActions(prev => prev.filter(a => a.id !== id)); if (status === 'approved' || status === 'rejected') { await load() } }
  }

  async function approveAllRoutine() {
    const routines = actions.filter(a => a.priority === 'routine')
    await Promise.all(routines.map(a => updateAction(a.id, 'approved')))
    await load()
  }

  async function saveOutcome(id: string) {
    setSavingOutcome(true)
    try {
      await fetch('/api/aria/autopilot?id=' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome_note: outcomeNote || null,
          outcome_revenue_cents: outcomeRevenue ? Math.round(parseFloat(outcomeRevenue) * 100) : null,
        }),
      })
      setHistory(prev => prev.map(a => a.id === id
        ? { ...a, outcome_note: outcomeNote || null, outcome_revenue_cents: outcomeRevenue ? Math.round(parseFloat(outcomeRevenue) * 100) : null }
        : a))
      setEditingOutcome(null)
    } catch { /* ignore */ }
    setSavingOutcome(false)
  }

  const byPriority = (p: string) => actions.filter(a => a.priority === p)

  // Total revenue recovered from outcomes
  const totalOutcomeRevenue = history.reduce((sum, a) => sum + (a.outcome_revenue_cents ?? 0), 0)

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>⚡ Aria Autopilot</h1>
          <p style={{ fontSize: 12, color: C.muted }}>AI-generated actions based on your live business data{lastRun && (' — analysed at ' + lastRun)}</p>
        </div>
        <button onClick={runAnalysis} disabled={running} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: running ? 0.6 : 1 }}>
          {running ? '✨ Analysing…' : '▶ Run Analysis'}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, borderBottom: '1px solid ' + C.border, background: C.border }}>
        {[
          { label: 'Pending', value: stats.pending, color: C.amber },
          { label: 'Approved', value: stats.approved, color: C.green },
          { label: 'Executed', value: stats.executed, color: C.violet },
          { label: 'Revenue recovered', value: totalOutcomeRevenue > 0 ? 'A$' + Math.round(totalOutcomeRevenue / 100).toLocaleString() : '—', color: C.green },
        ].map(s => (
          <div key={s.label} style={{ background: C.bg, padding: '14px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: s.label === 'Revenue recovered' ? 16 : 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid ' + C.border, padding: '0 28px' }}>
        {(['pending', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '12px 16px', border: 'none', borderBottom: '2px solid ' + (tab === t ? C.violet : 'transparent'), background: 'transparent', color: tab === t ? C.text : C.muted, fontSize: 13, fontWeight: tab === t ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {t === 'pending' ? 'Pending actions (' + stats.pending + ')' : 'History & Outcomes'}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, fontSize: 13, color: C.red }}>⚠️ {error}</div>}
        {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: C.dim }}>Loading…</div>}

        {tab === 'pending' && !loading && (
          <>
            {actions.length === 0 && (
              <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>⚡</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>No pending actions</p>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>Run analysis to generate AI-powered recommendations from your live sales data.</p>
                <button onClick={runAnalysis} disabled={running} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: C.violet, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: running ? 0.6 : 1 }}>
                  {running ? 'Analysing…' : '▶ Run Analysis Now'}
                </button>
              </div>
            )}
            {(['urgent', 'important', 'routine'] as const).map(priority => {
              const items = byPriority(priority)
              if (!items.length) return null
              const pStyle = PRIORITY_COLOR[priority]
              return (
                <div key={priority}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h2 style={{ fontSize: 13, fontWeight: 700, color: pStyle.accent }}>{pStyle.label} — {items.length} action{items.length !== 1 ? 's' : ''}</h2>
                    {priority === 'routine' && items.length > 1 && (
                      <button onClick={approveAllRoutine} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + pStyle.border, background: pStyle.bg, color: pStyle.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ✓ Approve All Routine
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map(action => (
                      <div key={action.id} style={{ background: pStyle.bg, border: '1px solid ' + pStyle.border, borderLeft: '4px solid ' + pStyle.accent, borderRadius: '0 12px 12px 0', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{CATEGORY_ICON[action.category] ?? CATEGORY_ICON.GENERAL}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pStyle.accent + '20', color: pStyle.accent }}>{action.category}</span>
                            <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{action.title}</p>
                          </div>
                          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: action.estimated_impact ? 6 : 0 }}>{action.description}</p>
                          {action.estimated_impact && <p style={{ fontSize: 12, fontWeight: 600, color: pStyle.accent }}>💡 {action.estimated_impact}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => updateAction(action.id, 'approved')} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Approve</button>
                          <button onClick={() => updateAction(action.id, 'rejected')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✗ Dismiss</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {tab === 'history' && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.length === 0 && <p style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>No approved actions yet. Run an analysis and approve some actions to see them here.</p>}
            {history.map(action => {
              const pStyle = PRIORITY_COLOR[action.priority as keyof typeof PRIORITY_COLOR] ?? PRIORITY_COLOR.routine
              const isEditingThis = editingOutcome === action.id
              return (
                <div key={action.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{CATEGORY_ICON[action.category] ?? CATEGORY_ICON.GENERAL}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{action.title}</p>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pStyle.accent + '15', color: pStyle.accent }}>{action.status.toUpperCase()}</span>
                      </div>
                      {action.estimated_impact && <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{action.estimated_impact}</p>}
                      {action.approved_at && <p style={{ fontSize: 10, color: C.dim }}>{new Date(action.approved_at).toLocaleDateString('en-AU')}</p>}

                      {/* Outcome section */}
                      {action.outcome_note || action.outcome_revenue_cents ? (
                        <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: C.green, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outcome recorded</p>
                          {action.outcome_revenue_cents && (
                            <p style={{ fontSize: 14, fontWeight: 700, color: C.green, marginBottom: 2 }}>
                              +A${(action.outcome_revenue_cents / 100).toFixed(0)} revenue recovered
                            </p>
                          )}
                          {action.outcome_note && <p style={{ fontSize: 12, color: C.muted }}>{action.outcome_note}</p>}
                          <button onClick={() => { setEditingOutcome(action.id); setOutcomeNote(action.outcome_note ?? ''); setOutcomeRevenue(action.outcome_revenue_cents ? (action.outcome_revenue_cents / 100).toFixed(2) : '') }}
                            style={{ fontSize: 10, color: C.dim, background: 'transparent', border: 'none', cursor: 'pointer', marginTop: 4, fontFamily: 'inherit' }}>Edit outcome</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingOutcome(action.id); setOutcomeNote(''); setOutcomeRevenue('') }}
                          style={{ marginTop: 8, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.25)', background: 'transparent', color: C.green, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                          + Record outcome
                        </button>
                      )}

                      {isEditingThis && (
                        <div style={{ marginTop: 10, padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid ' + C.border, borderRadius: 8 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8 }}>Record what happened</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8, marginBottom: 8 }}>
                            <input
                              type="text"
                              placeholder="What was the result? (e.g. Reordered stock, avoided stockout)"
                              value={outcomeNote}
                              onChange={e => setOutcomeNote(e.target.value)}
                              style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 7, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                            />
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Revenue A$"
                              value={outcomeRevenue}
                              onChange={e => setOutcomeRevenue(e.target.value)}
                              style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 7, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => saveOutcome(action.id)} disabled={savingOutcome}
                              style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: savingOutcome ? 0.6 : 1 }}>
                              {savingOutcome ? 'Saving...' : 'Save outcome'}
                            </button>
                            <button onClick={() => setEditingOutcome(null)}
                              style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
