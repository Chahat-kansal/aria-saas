'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  product_id?: string
  product_name?: string
  quantity?: number
  unit_price?: number
  note?: string
  modifiers?: { id: string; name: string; price_cents: number }[]
  config?: {
    mode?: string
    layers?: string[]
    added?: { id: string; name: string; priceCents: number }[]
    removed?: { name: string }[]
  }
}

interface OnlineOrder {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  status: string
  total: number
  notes: string | null
  source: string
  fulfillment_type: string | null
  pickup_time: string | null
  created_at: string
  items: OrderItem[] | null
  estimated_ready_at: string | null
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'New',       bg: 'rgba(217,245,78,0.15)',  color: '#bcd930' },
  accepted:  { label: 'Accepted',  bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa' },
  confirmed: { label: 'Confirmed', bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa' },
  preparing: { label: 'Preparing', bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24' },
  ready:     { label: 'Ready',     bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
  completed: { label: 'Done',      bg: 'rgba(100,116,139,0.12)', color: '#94a3b8' },
  rejected:  { label: 'Rejected',  bg: 'rgba(239,68,68,0.12)',   color: '#f87171' },
  cancelled: { label: 'Cancelled', bg: 'rgba(239,68,68,0.12)',   color: '#f87171' },
}

function nextStatuses(status: string): { label: string; status: string; danger?: boolean }[] {
  switch (status) {
    case 'pending':   return [{ label: 'Accept', status: 'accepted' }, { label: 'Reject', status: 'rejected', danger: true }]
    case 'accepted':
    case 'confirmed': return [{ label: 'Start Preparing', status: 'preparing' }, { label: 'Reject', status: 'rejected', danger: true }]
    case 'preparing': return [{ label: 'Mark Ready', status: 'ready' }]
    case 'ready':     return [{ label: 'Mark picked up ✓', status: 'completed' }]
    default:          return []
  }
}

function isToday(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35)
  // M13 phase 2 — was silent. A WebAudio beep: autoplay policy or a missing AudioContext makes this
  // throw legitimately, so it stays non-fatal. It still says so rather than saying nothing.
  } catch (e) { console.warn('[online-orders] order beep unavailable:', (e as Error).message) }
}

// ── Build config display ──────────────────────────────────────────────────────

function BuildSummary({ item }: { item: OrderItem }) {
  const { config } = item
  if (!config || config.mode !== 'build') return null
  const removed = config.removed ?? []
  const added   = config.added   ?? []
  if (removed.length === 0 && added.length === 0) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {removed.map((r, i) => (
        <span key={i} style={{ fontSize: 10, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 5, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {'NO ' + r.name.toUpperCase()}
        </span>
      ))}
      {added.map((a, i) => (
        <span key={i} style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5, padding: '2px 6px' }}>
          {'+' + a.name}
        </span>
      ))}
    </div>
  )
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({ order, onAdvance }: { order: OnlineOrder; onAdvance: (id: string, status: string) => Promise<void> }) {
  const [busy, setBusy] = useState('')
  const sm = STATUS_META[order.status] ?? STATUS_META.pending
  const actions = nextStatuses(order.status)
  const items = order.items ?? []

  async function advance(newStatus: string) {
    setBusy(newStatus)
    await onAdvance(order.id, newStatus)
    setBusy('')
  }

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--divider)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono',monospace" }}>{order.order_number}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: sm.bg, color: sm.color, whiteSpace: 'nowrap' }}>{sm.label}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{order.customer_name}</div>
          {order.customer_phone && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>{order.customer_phone}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono',monospace" }}>{'A$' + Number(order.total).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{fmtTime(order.created_at)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{(order.fulfillment_type ?? 'pickup').charAt(0).toUpperCase() + (order.fulfillment_type ?? 'pickup').slice(1)}</div>
        </div>
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, idx) => (
            <div key={idx}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-primary)' }}>
                <span style={{ fontWeight: 600 }}>{(item.quantity ?? 1) > 1 ? item.quantity + ' × ' : ''}{item.product_name ?? 'Item'}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono',monospace" }}>{'A$' + (Number(item.unit_price ?? 0) * (item.quantity ?? 1)).toFixed(2)}</span>
              </div>
              <BuildSummary item={item} />
              {item.modifiers && item.modifiers.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{item.modifiers.map(m => m.name).join(', ')}</div>
              )}
              {item.note && (
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <span style={{ fontSize: 11 }}>📝</span>
                  <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700, fontStyle: 'italic', lineHeight: 1.4 }}>{item.note}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', borderLeft: '2px solid var(--divider)' }}>
          <span style={{ fontWeight: 700 }}>Note: </span>{order.notes}
        </div>
      )}

      {/* Action buttons */}
      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--divider)', paddingTop: 10 }}>
          {actions.map(a => (
            <button
              key={a.status}
              onClick={() => advance(a.status)}
              disabled={busy !== ''}
              style={{
                flex: a.danger ? 0 : 1, padding: '8px 14px', borderRadius: 9, border: 'none',
                background: a.danger ? 'rgba(239,68,68,0.10)' : 'var(--violet)',
                color: a.danger ? '#ef4444' : '#fff',
                fontSize: 13, fontWeight: 700, cursor: busy !== '' ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: busy !== '' ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {busy === a.status ? '…' : a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['pending', 'accepted', 'confirmed', 'preparing', 'ready']
const TABS = ['active', 'completed', 'all'] as const

export default function OnlineOrdersPage() {
  const [orders, setOrders] = useState<OnlineOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('active')
  const prevCountRef = useRef(0)
  const [newBadge, setNewBadge] = useState(0)

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/pos/online-orders?limit=100')
      if (!res.ok) return
      const d = await res.json() as { orders?: OnlineOrder[] }
      const all = (d.orders ?? []).filter(o => isToday(o.created_at))
      setOrders(all)
      setLoading(false)
      const pendingCount = all.filter(o => o.status === 'pending').length
      if (prevCountRef.current > 0 && pendingCount > prevCountRef.current) {
        const diff = pendingCount - prevCountRef.current
        setNewBadge(n => n + diff)
        playBeep()
      }
      prevCountRef.current = pendingCount
    // M13 phase 2 — was silent. Cosmetic (the new-order badge and beep), so it stays non-fatal.
    } catch (e) { console.error('[online-orders] badge/beep refresh failed:', (e as Error).message) }
  }, [])

  useEffect(() => {
    fetchOrders()
    const id = setInterval(fetchOrders, 10000)
    return () => clearInterval(id)
  }, [fetchOrders])

  async function handleAdvance(id: string, status: string) {
    try {
      await fetch('/api/pos/online-orders/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
      if (status === 'accepted' || status === 'confirmed') {
        prevCountRef.current = Math.max(0, prevCountRef.current - 1)
      }
    // M13 phase 2 — was silent, and this is the costly one of the five. The row above updates the
    // order's status in LOCAL state optimistically; if the write failed, the screen shows the order
    // as accepted when the kitchen has no such record. Logging does not undo the optimistic update
    // — that is a product decision, named in RUN-M13.md — but the failure is no longer invisible.
    } catch (e) { console.error('[online-orders] status update failed:', id, status, (e as Error).message) }
  }

  const filtered = orders.filter(o => {
    if (activeTab === 'active')    return ACTIVE_STATUSES.includes(o.status)
    if (activeTab === 'completed') return o.status === 'completed' || o.status === 'rejected' || o.status === 'cancelled'
    return true
  })

  const activeCount = orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length
  const pendingCount = orders.filter(o => o.status === 'pending').length

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 10 }}>
            Online Orders
            {pendingCount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 800, background: '#d9f54e', color: '#1a2a0f', borderRadius: 99, padding: '2px 8px', minWidth: 24, textAlign: 'center' }}>
                {pendingCount} new
              </span>
            )}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
            {activeCount} active · {orders.length} today · auto-refreshes every 10s
          </p>
        </div>
        {newBadge > 0 && (
          <button onClick={() => setNewBadge(0)} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#d9f54e', color: '#1a2a0f', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {newBadge} new order{newBadge > 1 ? 's' : ''} ↑
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)', padding: '0 24px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding: '11px 16px', background: 'none', border: 'none', borderBottom: '2px solid ' + (activeTab === t ? 'var(--violet)' : 'transparent'), color: activeTab === t ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 13, fontWeight: activeTab === t ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'active' && activeCount > 0 ? ' (' + activeCount + ')' : ''}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '20px 24px', maxWidth: 760, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🍽️</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              {activeTab === 'active' ? 'No active orders right now' : 'No orders found'}
            </p>
            <p style={{ fontSize: 13, margin: 0 }}>New orders will appear here and refresh automatically.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(o => (
              <OrderCard key={o.id} order={o} onAdvance={handleAdvance} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}