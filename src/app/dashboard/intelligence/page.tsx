'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface IntelligenceEvent {
  id: string; event_type: string; severity: 'critical'|'high'|'medium'|'info';
  title: string; body: string; data?: Record<string, unknown> | null;
  action_label?: string | null; action_href?: string | null; triggered_at: string; acknowledged: boolean;
}
interface Hypothesis { id: string; title: string; description: string | null; category: string | null; predicted_impact_cents: number | null; predicted_impact_label: string | null; risk_level: string | null; confidence: number | null; status: string | null; generated_at: string; outcome_verdict: string | null }
interface Stats { total: number; resolved: number; resolution_rate: number; most_common: { type: string; count: number } | null; weekly: Array<{ week: string; generated: number; resolved: number }> }

const CATS = ['all','revenue','stock','customers','competitors','opportunities'] as const
type Cat = typeof CATS[number]

const CAT_RULES: Record<Cat, (e: IntelligenceEvent) => boolean> = {
  all: () => true,
  revenue: e => /revenue|sales|cashflow|spike|slow_day|drop/i.test(e.event_type),
  stock: e => /stock|inventory|reorder|expir|dead_stock/i.test(e.event_type),
  customers: e => /customer|churn|vip|loyal/i.test(e.event_type),
  competitors: e => /competitor|rating|review_spike/i.test(e.event_type),
  opportunities: e => /opportunity|upsell|promot|gap/i.test(e.event_type),
}

const PRIORITY: Record<string, { label: string; color: string; rank: number }> = {
  critical: { label: 'Critical', color: '#ef4444', rank: 0 },
  high:     { label: 'High',     color: '#f59e0b', rank: 1 },
  medium:   { label: 'Medium',   color: '#fbbf24', rank: 2 },
  info:     { label: 'Low',      color: '#6b7280', rank: 3 },
}

function priorityFor(e: IntelligenceEvent): 'critical' | 'high' | 'medium' | 'info' {
  const impact = Number((e.data as { revenue_impact?: number; impact_dollars?: number } | null)?.revenue_impact ?? (e.data as { impact_dollars?: number } | null)?.impact_dollars ?? 0)
  if (impact > 500) return 'critical'
  if (impact >= 100) return 'high'
  if (e.severity === 'critical') return 'critical'
  if (e.severity === 'high') return 'high'
  if (e.severity === 'medium') return 'medium'
  if (/stock/i.test(e.event_type)) return 'high'
  if (/churn|opportunity/i.test(e.event_type)) return 'medium'
  return 'info'
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

function getActionLabel(eventType: string): string {
  if (/low_stock|reorder/i.test(eventType)) return 'Reorder now →'
  if (/pricing_gap|price_below_cost/i.test(eventType)) return 'Fix price →'
  if (/dead_stock/i.test(eventType)) return 'Run promo →'
  if (/slow_day|quiet_period/i.test(eventType)) return 'View promotions →'
  if (/churn_risk|lapsed_customer/i.test(eventType)) return 'Send winback →'
  if (/review_unreplied/i.test(eventType)) return 'Reply to reviews →'
  if (/expiry_alert/i.test(eventType)) return 'View expiry →'
  return 'Fix this →'
}

const C = { bg: '#0d0d14', surface: '#13131a', border: 'rgba(255,255,255,0.06)', text: '#E8EDE7', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)', green: '#7FB897', violet: '#A78BFA' }

export default function IntelligencePage() {
  const { business } = useBusinessContext()
  const router = useRouter()
  const [events, setEvents] = useState<IntelligenceEvent[]>([])
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<Cat>('all')
  const [selected, setSelected] = useState<IntelligenceEvent | null>(null)
  const [newCount, setNewCount] = useState(0)
  const [acking, setAcking] = useState<string | null>(null)
  const [actionFiring, setActionFiring] = useState<Record<string, boolean>>({})
  const [verdictFiring, setVerdictFiring] = useState<Record<string, boolean>>({})
  const [patterns, setPatterns] = useState<Array<{ id: string; title: string; body: string; triggered_at: string; acknowledged: boolean }>>([])
  const [patternsLoading, setPatternsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const [evRes, hRes, sRes] = await Promise.all([
      fetch('/api/intelligence-events?business_id=' + business.id + '&limit=100').then(r => r.json()).catch(() => ({ events: [] })),
      fetch('/api/aria/hypotheses?business_id=' + business.id).then(r => r.json()).catch(() => ({ hypotheses: [] })),
      fetch('/api/intelligence-events/stats?business_id=' + business.id).then(r => r.json()).catch(() => null),
    ])
    setEvents(evRes.events ?? [])
    setHypotheses(hRes.hypotheses ?? [])
    setStats(sRes)
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  // Realtime subscription for live signals
  useEffect(() => {
    if (!business?.id || !supabase) return
    const channel = supabase.channel('intelligence-feed-' + business.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'intelligence_events', filter: 'business_id=eq.' + business.id }, (payload: { new: IntelligenceEvent }) => {
        const row = payload.new
        setEvents(prev => [row, ...prev])
        setNewCount(n => n + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business?.id])

  // Fetch pattern history when an event is selected
  useEffect(() => {
    if (!selected || !business?.id) {
      setPatterns([])
      return
    }
    setPatternsLoading(true)
    fetch('/api/intelligence-events/patterns?event_type=' + encodeURIComponent(selected.event_type) + '&business_id=' + business.id)
      .then(r => r.json())
      .then(d => { setPatterns(d.patterns ?? []) })
      .catch(() => setPatterns([]))
      .finally(() => setPatternsLoading(false))
  }, [selected?.id, business?.id])

  const [clearingAll, setClearingAll] = useState(false)
  const [toast, setToast] = useState('')

  async function clearAll() {
    if (!business?.id) return
    const unread = events.filter(e => !e.acknowledged)
    if (unread.length === 0) return
    if (!confirm('Dismiss all ' + unread.length + ' alert' + (unread.length === 1 ? '' : 's') + '?')) return
    setClearingAll(true)
    try {
      await Promise.all(unread.map(e =>
        fetch('/api/intelligence-events', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: e.id, business_id: business.id, acknowledged: true }),
        }).catch(() => {})
      ))
      setEvents(prev => prev.map(e => ({ ...e, acknowledged: true })))
      setSelected(null); setNewCount(0)
      setToast('All ' + unread.length + ' alert' + (unread.length === 1 ? '' : 's') + ' cleared')
      setTimeout(() => setToast(''), 2500)
    } finally { setClearingAll(false) }
  }

  async function acknowledge(id: string, resolved = true) {
    if (!business?.id) return
    setAcking(id)
    try {
      await fetch('/api/intelligence-events', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, business_id: business.id, acknowledged: resolved }),
      })
      setEvents(prev => prev.map(e => e.id === id ? { ...e, acknowledged: resolved } : e))
      if (selected?.id === id) setSelected(null)
    } finally { setAcking(null) }
  }

  async function updateHypothesis(id: string, status: string) {
    await fetch('/api/aria/hypotheses?id=' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setHypotheses(hs => hs.map(h => h.id === id ? { ...h, status } : h))
  }

  async function submitVerdict(h: Hypothesis, verdict: 'worked' | 'failed' | 'inconclusive') {
    if (!business?.id) return
    setVerdictFiring(prev => ({ ...prev, [h.id]: true }))
    try {
      await fetch('/api/aria/hypotheses/' + h.id + '/outcome', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict }),
      }).catch(() => null)
      setHypotheses(hs => hs.map(item => item.id === h.id ? { ...item, outcome_verdict: verdict, status: 'closed' } : item))
      fetch('/api/aria/autopilot-actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, action_type: 'intelligence_action_taken', payload: { event_type: 'hypothesis_verdict', verdict } }),
      }).catch(() => null)
      setToast('Outcome recorded')
      setTimeout(() => setToast(''), 2500)
    } finally {
      setVerdictFiring(prev => ({ ...prev, [h.id]: false }))
    }
  }

  async function handleEventAction(e: IntelligenceEvent) {
    if (!business?.id) return
    setActionFiring(prev => ({ ...prev, [e.id]: true }))
    try {
      if (/low_stock|reorder/i.test(e.event_type)) {
        await fetch('/api/pos/purchase-orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: business.id, product_id: (e.data as { product_id?: string } | null)?.product_id }),
        }).catch(() => null)
      } else if (/pricing_gap|price_below_cost/i.test(e.event_type)) {
        const productId = (e.data as { product_id?: string } | null)?.product_id
        const suggestedPrice = (e.data as { suggested_price?: number } | null)?.suggested_price
        if (productId && suggestedPrice) {
          await fetch('/api/pos/products/' + productId, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: suggestedPrice }),
          }).catch(() => null)
        }
      } else if (/dead_stock/i.test(e.event_type)) {
        await fetch('/api/pos/promotions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: business.id, discount_pct: 20, product_id: (e.data as { product_id?: string } | null)?.product_id }),
        }).catch(() => null)
      } else if (/slow_day|quiet_period/i.test(e.event_type)) {
        router.push('/dashboard/promotions')
        setActionFiring(prev => ({ ...prev, [e.id]: false }))
        return
      } else if (/churn_risk|lapsed_customer/i.test(e.event_type)) {
        await fetch('/api/aria/winback', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: business.id, customer_ids: (e.data as { customer_ids?: string[] } | null)?.customer_ids ?? [] }),
        }).catch(() => null)
      } else if (/review_unreplied/i.test(e.event_type)) {
        router.push('/dashboard/reviews')
        setActionFiring(prev => ({ ...prev, [e.id]: false }))
        return
      } else if (/expiry_alert/i.test(e.event_type)) {
        router.push('/dashboard/warehouse?tab=expiry')
        setActionFiring(prev => ({ ...prev, [e.id]: false }))
        return
      } else {
        if (e.action_href) {
          router.push(e.action_href)
        } else {
          await acknowledge(e.id, true)
        }
        setActionFiring(prev => ({ ...prev, [e.id]: false }))
        return
      }

      await acknowledge(e.id, true)
      setToast('Done')
      setTimeout(() => setToast(''), 2500)
      fetch('/api/aria/autopilot-actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, action_type: 'intelligence_action_taken', payload: { event_type: e.event_type } }),
      }).catch(() => null)
    } catch {
      setToast('Action failed — try again')
      setTimeout(() => setToast(''), 2500)
    } finally {
      setActionFiring(prev => ({ ...prev, [e.id]: false }))
    }
  }

  // Apply category filter + priority sort
  const filtered = events.filter(e => CAT_RULES[cat](e) && !e.acknowledged)
    .map(e => ({ ...e, _p: priorityFor(e) }))
    .sort((a, b) => PRIORITY[a._p].rank - PRIORITY[b._p].rank || new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime())

  const actionRequired = filtered.filter(e => e._p === 'critical' || e._p === 'high')
  const others = filtered.filter(e => e._p !== 'critical' && e._p !== 'high')

  const catCounts: Record<Cat, number> = { all: 0, revenue: 0, stock: 0, customers: 0, competitors: 0, opportunities: 0 }
  for (const e of events) {
    if (e.acknowledged) continue
    for (const c of CATS) if (CAT_RULES[c](e)) catCounts[c]++
  }

  const renderEvent = (e: IntelligenceEvent & { _p?: string }) => {
    const p = e._p ?? priorityFor(e)
    const pm = PRIORITY[p]
    const isSel = selected?.id === e.id
    return (
      <div key={e.id} onClick={() => setSelected(e)}
        style={{ padding: '14px 16px', borderRadius: 10, cursor: 'pointer', background: isSel ? 'rgba(127,184,151,0.06)' : C.surface, border: '1px solid ' + (isSel ? 'rgba(127,184,151,0.3)' : C.border), borderLeft: '4px solid ' + pm.color, transition: 'all 0.12s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pm.color + '20', color: pm.color }}>{pm.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</span>
          </div>
          <span style={{ fontSize: 10, color: C.dim, flexShrink: 0 }}>{timeAgo(e.triggered_at)}</span>
        </div>
        <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.55, margin: 0 }}>{e.body}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, color: C.text, fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + C.border, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              Intelligence Centre
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.green, fontWeight: 500 }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: '0 0 6px ' + C.green, animation: 'pulse 2s infinite' }} />
                LIVE
              </span>
            </h1>
            <p style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{filtered.length} active signals for {business?.name ?? 'your business'}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {newCount > 0 && (
              <button onClick={() => { setNewCount(0); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + C.green, background: 'rgba(127,184,151,0.15)', color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {newCount} new ↑
              </button>
            )}
            {events.filter(e => !e.acknowledged).length > 0 && (
              <button onClick={clearAll} disabled={clearingAll}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'rgba(255,255,255,0.04)', color: C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: clearingAll ? 0.5 : 1 }}>
                {clearingAll ? 'Clearing…' : 'Clear all'}
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 24px', borderBottom: '1px solid ' + C.border, overflowX: 'auto' }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: cat === c ? 'rgba(127,184,151,0.15)' : 'transparent', color: cat === c ? C.green : C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
              {c} {catCounts[c] > 0 && <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: cat === c ? C.green + '30' : 'rgba(255,255,255,0.08)' }}>{catCounts[c]}</span>}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? <p style={{ color: C.dim, textAlign: 'center', padding: 40 }}>Loading…</p>
            : filtered.length === 0 && hypotheses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: C.dim }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(127,184,151,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: C.green, fontWeight: 700, fontSize: 20 }}>✓</div>
                <p style={{ fontSize: 16, fontWeight: 700, color: C.text }}>All clear</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>No active signals right now.</p>
              </div>
            ) : (
              <>
                {actionRequired.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    <p style={{ fontSize: 10, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>⚡ Action required</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{actionRequired.map(renderEvent)}</div>
                  </div>
                )}

                {hypotheses.filter(h => h.status === 'testing' || !h.status).length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    <p style={{ fontSize: 10, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>✦ Aria is testing</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {hypotheses.filter(h => h.status === 'testing' || !h.status).slice(0, 3).map(h => {
                        const daysOld = Math.floor((Date.now() - new Date(h.generated_at).getTime()) / 86400000)
                        const showVerdict = h.status === 'active' || (daysOld > 14 && h.status !== 'closed')
                        return (
                          <div key={h.id} style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
                            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{h.title}</p>
                            {h.description && <p style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{h.description}</p>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {h.predicted_impact_label && <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>+{h.predicted_impact_label}</span>}
                              {h.confidence != null && <span style={{ fontSize: 10, color: C.dim }}>{Math.round(Number(h.confidence) * 100)}% confidence</span>}
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                <button onClick={() => updateHypothesis(h.id, 'accepted')} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: 'none', background: 'rgba(127,184,151,0.15)', color: C.green, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Confirm</button>
                                <button onClick={() => updateHypothesis(h.id, 'rejected')} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                              </div>
                            </div>
                            {showVerdict && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <p style={{ fontSize: 10, color: C.dim, marginBottom: 6 }}>Did this work?</p>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={() => submitVerdict(h, 'worked')} disabled={verdictFiring[h.id]}
                                    style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.15)', color: '#22C55E', fontWeight: 700, cursor: verdictFiring[h.id] ? 'default' : 'pointer', fontFamily: 'inherit', opacity: verdictFiring[h.id] ? 0.5 : 1 }}>
                                    ✓ Yes, worked
                                  </button>
                                  <button onClick={() => submitVerdict(h, 'failed')} disabled={verdictFiring[h.id]}
                                    style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 700, cursor: verdictFiring[h.id] ? 'default' : 'pointer', fontFamily: 'inherit', opacity: verdictFiring[h.id] ? 0.5 : 1 }}>
                                    ✗ Didn&apos;t work
                                  </button>
                                  <button onClick={() => submitVerdict(h, 'inconclusive')} disabled={verdictFiring[h.id]}
                                    style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, cursor: verdictFiring[h.id] ? 'default' : 'pointer', fontFamily: 'inherit', opacity: verdictFiring[h.id] ? 0.5 : 1 }}>
                                    ~ Inconclusive
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {hypotheses.filter(h => h.status === 'closed').length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>✓ Validated hypotheses</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {hypotheses.filter(h => h.status === 'closed').slice(0, 5).map(h => {
                        const vColor = h.outcome_verdict === 'worked' ? '#22C55E' : h.outcome_verdict === 'failed' ? '#ef4444' : '#f59e0b'
                        const vLabel = h.outcome_verdict === 'worked' ? '✓ Worked' : h.outcome_verdict === 'failed' ? '✗ Didn\'t work' : '~ Inconclusive'
                        return (
                          <div key={h.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>{h.title}</p>
                            {h.outcome_verdict && (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: vColor + '18', color: vColor, fontWeight: 700, flexShrink: 0 }}>{vLabel}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {others.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>Other signals</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{others.map(renderEvent)}</div>
                  </div>
                )}
              </>
            )}

          {/* Footer stats */}
          {stats && (
            <div style={{ marginTop: 30, padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Resolution rate</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: C.green }}>{stats.resolution_rate}%</p>
                  <p style={{ fontSize: 10, color: C.muted }}>{stats.resolved} of {stats.total} this month</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total signals</p>
                  <p style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Most common</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.violet, marginTop: 6 }}>{stats.most_common ? stats.most_common.type.replace(/_/g, ' ') : '—'}</p>
                  {stats.most_common && <p style={{ fontSize: 10, color: C.muted }}>{stats.most_common.count} occurrences</p>}
                </div>
              </div>
              {stats.weekly.length > 0 && (() => { const maxV = Math.max(1, ...stats.weekly.map(w => w.generated)); return (
                <div>
                  <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Generated vs resolved per week</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 50 }}>
                    {stats.weekly.slice(-8).map(w => (
                      <div key={w.week} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} title={w.week + ': ' + w.generated + ' / ' + w.resolved}>
                        <div style={{ height: (w.generated / maxV * 100) + '%', background: 'rgba(127,184,151,0.3)', borderRadius: '2px 2px 0 0', position: 'relative' }}>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: (w.resolved / Math.max(1, w.generated) * 100) + '%', background: C.green }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) })()}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <aside style={{ width: 380, borderLeft: '1px solid ' + C.border, background: C.surface, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid ' + C.border, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: PRIORITY[priorityFor(selected)].color + '20', color: PRIORITY[priorityFor(selected)].color }}>{PRIORITY[priorityFor(selected)].label}</span>
              <p style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{selected.title}</p>
              <p style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{timeAgo(selected.triggered_at)} · {selected.event_type}</p>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What happened</p>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: C.text, marginBottom: 16 }}>{selected.body}</p>

            {selected.data && Object.keys(selected.data).length > 0 && (
              <>
                <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Why it matters</p>
                <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid ' + C.border, marginBottom: 16, fontSize: 12, color: C.dim, fontFamily: 'monospace' }}>
                  {Object.entries(selected.data).slice(0, 6).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span>{k.replace(/_/g, ' ')}</span>
                      <span style={{ color: C.text }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Pattern history */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Pattern history</p>
              {patternsLoading ? (
                <p style={{ fontSize: 11, color: C.muted }}>Loading pattern history…</p>
              ) : patterns.length === 0 ? (
                <p style={{ fontSize: 11, color: C.muted }}>First time we&apos;ve seen this</p>
              ) : (
                <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid ' + C.border }}>
                  <p style={{ fontSize: 11, color: C.green, fontWeight: 600, marginBottom: 6 }}>
                    This happened {patterns.length} time{patterns.length === 1 ? '' : 's'} before
                  </p>
                  {patterns.map(p => (
                    <p key={p.id} style={{ fontSize: 11, color: C.dim, margin: '2px 0' }}>
                      · {new Date(p.triggered_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  ))}
                  {patterns.length >= 2 && (
                    <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 8 }}>
                      Recurring {selected.event_type.replace(/_/g, ' ')} pattern detected — this appears to be a systemic issue.
                    </p>
                  )}
                </div>
              )}
            </div>

            <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Take action</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Primary one-click action button */}
              <button
                onClick={() => handleEventAction(selected)}
                disabled={actionFiring[selected.id]}
                style={{ padding: '11px 14px', borderRadius: 8, border: 'none', background: C.green, color: '#0d0d14', fontSize: 13, fontWeight: 700, cursor: actionFiring[selected.id] ? 'default' : 'pointer', fontFamily: 'inherit', opacity: actionFiring[selected.id] ? 0.6 : 1, width: '100%', textAlign: 'center' }}>
                {actionFiring[selected.id] ? 'Working…' : getActionLabel(selected.event_type)}
              </button>

              {selected.action_href && selected.action_label && (
                <Link href={selected.action_href} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(127,184,151,0.12)', color: C.green, fontSize: 12, fontWeight: 600, textDecoration: 'none', textAlign: 'center', border: '1px solid rgba(127,184,151,0.2)' }}>
                  {selected.action_label} →
                </Link>
              )}
              <Link href={'/dashboard/ask-aria?context=' + encodeURIComponent(selected.title)}
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid ' + C.border, color: C.violet, fontSize: 12, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                ✦ Ask Aria what to do
              </Link>
              <button onClick={() => acknowledge(selected.id, true)} disabled={acking === selected.id}
                style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: 'rgba(127,184,151,0.15)', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: acking === selected.id ? 0.5 : 1 }}>
                ✓ Mark resolved
              </button>
              <button onClick={() => acknowledge(selected.id, true)} disabled={acking === selected.id}
                style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: 'transparent', color: C.dim, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: acking === selected.id ? 0.5 : 1 }}>
                Dismiss
              </button>
            </div>
          </div>
        </aside>
      )}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 10, background: C.surface, border: '1px solid ' + C.green, color: C.green, fontSize: 13, fontWeight: 600, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          ✓ {toast}
        </div>
      )}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}
