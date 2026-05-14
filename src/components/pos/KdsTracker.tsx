'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface KDSOrder {
  id: string
  table_label: string | null
  items: Array<{ name: string; qty: number }>
  status: string
  created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  new:         '#2563eb',
  in_progress: '#d97706',
  ready:       '#16a34a',
  delivered:   '#6b7280',
}
const STATUS_LABEL: Record<string, string> = {
  new:         'NEW',
  in_progress: 'IN PROGRESS',
  ready:       'READY',
  delivered:   'DONE',
}

export default function KdsTracker({ businessId }: { businessId: string | null }) {
  const [orders, setOrders] = useState<KDSOrder[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const load = useCallback(async () => {
    if (!businessId) return
    try {
      const res = await fetch('/api/pos/kds')
      if (res.ok) {
        const d = await res.json()
        setOrders(d.orders ?? [])
      }
    } catch { /* silent */ }
  }, [businessId])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 10000)
    return () => clearInterval(pollRef.current)
  }, [load])

  // Listen for order_ready BroadcastChannel signals
  useEffect(() => {
    let ch: BroadcastChannel | null = null
    try {
      ch = new BroadcastChannel('aria-kds')
      ch.onmessage = () => { load() }
    } catch { /* not available */ }
    return () => { ch?.close() }
  }, [load])

  const active = orders.filter(o => o.status !== 'void')
  if (active.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
        All clear ✓
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {active.map(o => {
        const elapsed = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000)
        const statusColor = STATUS_COLOR[o.status] ?? '#6b7280'
        return (
          <div key={o.id} style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px',
            border: `1px solid ${statusColor}40`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor, padding: '2px 7px', borderRadius: 99, background: `${statusColor}18` }}>
                {STATUS_LABEL[o.status] ?? o.status.toUpperCase()}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                {elapsed}m ago{o.table_label ? ` · ${o.table_label}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
              {o.items.slice(0, 3).map((item, i) => (
                <span key={i} style={{ marginRight: 8 }}>{item.qty}× {item.name}</span>
              ))}
              {o.items.length > 3 && <span style={{ color: 'rgba(255,255,255,0.3)' }}>+{o.items.length - 3} more</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}