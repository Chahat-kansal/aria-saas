'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import Link from 'next/link'

interface ReplenishItem {
  id: string; name: string; sku: string | null
  floor_qty: number; backroom_qty: number; shelf_capacity: number
  fill_pct: number; pull_qty: number; image_url: string | null
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)',
}

function fillColor(pct: number) {
  if (pct < 10) return C.red
  if (pct < 20) return C.amber
  return C.green
}

export default function ReplenishPage() {
  const { business } = useBusinessContext()
  const [items, setItems] = useState<ReplenishItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState<Set<string>>(new Set())
  const [pulled, setPulled] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const r = await fetch('/api/pos/warehouse/replenish?business_id=' + business.id).then(r => r.json()).catch(() => ({ items: [] }))
    setItems(r.items ?? [])
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  async function pullToFloor(item: ReplenishItem) {
    if (!business?.id || pulling.has(item.id)) return
    setPulling(prev => new Set(prev).add(item.id))
    try {
      await fetch('/api/pos/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          product_id: item.id,
          adjustment: item.pull_qty,
          reason: 'Pulled from backroom to floor',
        }),
      })
      // Deduct from backroom qty
      await fetch('/api/pos/products/' + item.id + '?action=update_general', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty_backroom: Math.max(0, item.backroom_qty - item.pull_qty) }),
      })
      setPulled(prev => new Set(prev).add(item.id))
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) { console.warn('[non-fatal]', e) }
    setPulling(prev => { const s = new Set(prev); s.delete(item.id); return s })
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Link href="/dashboard/warehouse" style={{ fontSize: 12, color: C.muted, textDecoration: 'none' }}>← Warehouse</Link>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Replenishment Queue</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Products where floor stock is below 20% of shelf capacity and backroom stock is available.</p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ↻ Refresh
        </button>
      </div>

      {pulled.size > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 13, color: C.green }}>
          {pulled.size} product{pulled.size > 1 ? 's' : ''} pulled to floor
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: C.muted, padding: '60px 0' }}>Loading…</div>}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>✓</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>All shelves are stocked</p>
          <p style={{ fontSize: 13, color: C.muted }}>No products need pulling from the backroom right now.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <div key={item.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {item.image_url && (
                <img src={item.image_url} alt={item.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{item.name}</p>
                {item.sku && <p style={{ fontSize: 11, color: C.dim }}>SKU: {item.sku}</p>}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.dim, marginBottom: 3 }}>
                    <span>Floor: {item.floor_qty} / {item.shelf_capacity}</span>
                    <span style={{ color: fillColor(item.fill_pct) }}>{item.fill_pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: fillColor(item.fill_pct), width: item.fill_pct + '%', transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>
                  Backroom: <strong style={{ color: C.text }}>{item.backroom_qty}</strong>
                </div>
                <div style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>
                  Pull: <strong style={{ color: C.amber }}>{item.pull_qty}</strong>
                </div>
                <button onClick={() => pullToFloor(item)} disabled={pulling.has(item.id)}
                  style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, cursor: pulling.has(item.id) ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: pulling.has(item.id) ? 0.6 : 1, minWidth: 44, minHeight: 44 }}>
                  {pulling.has(item.id) ? '…' : 'Pull to floor'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
