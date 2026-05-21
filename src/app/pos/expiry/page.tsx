'use client'
import { useState, useEffect, useCallback } from 'react'

interface Batch {
  id: string
  product_id: string
  product_name?: string
  expiry_date: string
  quantity_remaining: number
  batch_ref: string | null
}

interface Alert {
  id: string
  product_id: string
  batch_id: string
  alert_type: string
  days_until_expiry: number
  quantity_at_risk: number
  message: string
  acknowledged: boolean
  created_at: string
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  red: '#EF4444', orange: '#F97316', green: '#00B140', violet: '#006AFF',
  border: 'rgba(255,255,255,0.07)',
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function statusColor(days: number) {
  if (days < 0) return C.red
  if (days <= 3) return C.red
  if (days <= 7) return C.orange
  if (days <= 30) return '#F59E0B'
  return C.green
}

function statusLabel(days: number) {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `${days} days`
}

export default function ExpiryPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'ok'>('all')
  const [businessId, setBusinessId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Get business id
      const bizRes = await fetch('/api/pos/settings')
      const bizData = await bizRes.json() as { settings?: { business_id?: string } }
      const bid = bizData.settings?.business_id
      if (!bid) { setLoading(false); return }
      setBusinessId(bid)

      // Get expiring batches — all with expiry tracked, not expired more than 7 days
      const batchRes = await fetch(`/api/pos/expiry/batches?business_id=${bid}`)
      const batchData = await batchRes.json() as { batches?: Batch[] }
      setBatches(batchData.batches ?? [])

      // Get unacknowledged alerts
      const alertRes = await fetch(`/api/pos/expiry/alerts?business_id=${bid}`)
      const alertData = await alertRes.json() as { alerts?: Alert[] }
      setAlerts(alertData.alerts ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function acknowledge(alertId: string) {
    await fetch(`/api/pos/expiry/alerts/${alertId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acknowledged: true }) })
    setAlerts(a => a.map(x => x.id === alertId ? { ...x, acknowledged: true } : x))
  }

  async function markDisposed(batchId: string) {
    if (!confirm('Mark this stock as disposed/wasted?')) return
    await fetch(`/api/pos/product-batches/${batchId}/decrement`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qty: 999, reason: 'expired' }) })
    load()
  }

  const filtered = batches.filter(b => {
    const days = daysUntil(b.expiry_date)
    if (filter === 'critical') return days <= 3
    if (filter === 'warning') return days > 3 && days <= 7
    if (filter === 'ok') return days > 7
    return true
  }).sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime())

  const critical = batches.filter(b => daysUntil(b.expiry_date) <= 3).length
  const warning  = batches.filter(b => { const d = daysUntil(b.expiry_date); return d > 3 && d <= 7 }).length
  const unacknowledged = alerts.filter(a => !a.acknowledged).length

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>Expiry Tracking</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Monitor stock expiry dates across all products</p>
        </div>
        <button onClick={load} style={{ padding: '9px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total tracked', value: batches.length, color: C.violet },
          { label: 'Critical (≤3 days)', value: critical, color: C.red },
          { label: 'Warning (4-7 days)', value: warning, color: C.orange },
          { label: 'Unread alerts', value: unacknowledged, color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {unacknowledged > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Active alerts ({unacknowledged})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.filter(a => !a.acknowledged).map(a => (
              <div key={a.id} style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.red, marginRight: 8 }}>⚠️ {a.alert_type.replace(/_/g, ' ').toUpperCase()}</span>
                  <span style={{ fontSize: 13, color: C.text }}>{a.message}</span>
                </div>
                <button onClick={() => acknowledge(a.id)}
                  style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: 'rgba(239,68,68,0.12)', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'critical', 'warning', 'ok'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${filter === f ? C.violet : C.border}`, background: filter === f ? 'rgba(139,92,246,0.1)' : 'transparent', color: filter === f ? C.violet : C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Batch list */}
      {loading ? (
        <div style={{ color: C.muted, textAlign: 'center', padding: '60px 0' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: C.muted, textAlign: 'center', padding: '60px 0' }}>
          {batches.length === 0 ? 'No expiry-tracked stock. Track expiry dates when adding products at the POS terminal.' : 'No items match this filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 16px', fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Product</span><span>Expiry date</span><span>Status</span><span>Qty remaining</span><span>Action</span>
          </div>
          {filtered.map(b => {
            const days = daysUntil(b.expiry_date)
            const color = statusColor(days)
            return (
              <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{b.product_name ?? b.product_id}</div>
                  {b.batch_ref && <div style={{ fontSize: 11, color: C.dim }}>Batch: {b.batch_ref}</div>}
                </div>
                <div style={{ fontSize: 13 }}>{new Date(b.expiry_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}18`, padding: '3px 10px', borderRadius: 20 }}>
                    {statusLabel(days)}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: b.quantity_remaining <= 0 ? C.dim : C.text }}>{b.quantity_remaining} units</div>
                <button onClick={() => markDisposed(b.id)}
                  style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Mark disposed
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
