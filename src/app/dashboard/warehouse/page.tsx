'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import Link from 'next/link'

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)', teal: '#1D9E75',
}
function fmt(n: number) { return 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }

type Tab = 'overview' | 'replenish' | 'orders' | 'transfers' | 'dead-stock' | 'expiry'

interface StockItem { id: string; name: string; sku: string | null; stock: number; cost: number; value_cents: number; velocity_rank: string; needs_reorder: boolean; lot_qty: number | null; earliest_expiry: string | null }
interface ReplenishItem { id: string; name: string; floor_qty: number; backroom_qty: number; shelf_capacity: number; fill_pct: number; pull_qty: number }
interface PO { id: string; po_number: string; status: string; supplier_name: string | null; created_at: string; total_cost_cents: number; line_items: unknown[] | null }
interface Transfer { id: string; from_outlet: { name: string } | null; to_outlet: { name: string } | null; product: { name: string } | null; qty: number; status: string; created_at: string }
interface DeadItem { id: string; name: string; stock_quantity: number; value_cost: number; days_since: number; suggested_action: string }
interface ExpiryAlert { id: string; product_id: string; product_name: string; days_until_expiry: number; expiry_date: string | null; stock_quantity: number }

export default function WarehousePage() {
  const { business } = useBusinessContext()
  const [tab, setTab] = useState<Tab>('overview')

  // Overview state
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  // Replenishment
  const [replenish, setReplenish] = useState<ReplenishItem[]>([])
  const [replenishLoading, setReplenishLoading] = useState(false)
  const [pulling, setPulling] = useState<Set<string>>(new Set())
  // POs
  const [orders, setOrders] = useState<PO[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  // Transfers
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [transfersLoading, setTransfersLoading] = useState(false)
  // Dead stock
  const [dead, setDead] = useState<DeadItem[]>([])
  const [deadLoading, setDeadLoading] = useState(false)
  // Expiry
  const [expiry, setExpiry] = useState<ExpiryAlert[]>([])
  const [expiryLoading, setExpiryLoading] = useState(false)
  const [actioning, setActioning] = useState<string | null>(null)

  const bid = business?.id

  const loadOverview = useCallback(async () => {
    if (!bid) return
    setStockLoading(true)
    const r = await fetch('/api/warehouse/stock?business_id=' + bid).then(r => r.json()).catch(() => ({ items: [] }))
    setStockItems(r.items ?? [])
    setStockLoading(false)
  }, [bid])

  const loadReplenish = useCallback(async () => {
    if (!bid) return
    setReplenishLoading(true)
    const r = await fetch('/api/pos/warehouse/replenish?business_id=' + bid).then(r => r.json()).catch(() => ({ items: [] }))
    setReplenish(r.items ?? [])
    setReplenishLoading(false)
  }, [bid])

  const loadOrders = useCallback(async () => {
    if (!bid) return
    setOrdersLoading(true)
    const r = await fetch('/api/warehouse/purchase-orders?business_id=' + bid).then(r => r.json()).catch(() => ({ orders: [] }))
    setOrders(r.orders ?? [])
    setOrdersLoading(false)
  }, [bid])

  const loadTransfers = useCallback(async () => {
    if (!bid) return
    setTransfersLoading(true)
    const r = await fetch('/api/pos/outlet-transfers?business_id=' + bid).then(r => r.json()).catch(() => ({ transfers: [] }))
    setTransfers(r.transfers ?? [])
    setTransfersLoading(false)
  }, [bid])

  const loadDead = useCallback(async () => {
    if (!bid) return
    setDeadLoading(true)
    const r = await fetch('/api/pos/dead-stock').then(r => r.json()).catch(() => ({ items: [] }))
    setDead(r.items ?? [])
    setDeadLoading(false)
  }, [bid])

  const loadExpiry = useCallback(async () => {
    if (!bid) return
    setExpiryLoading(true)
    const r = await fetch('/api/pos/expiry-alerts?business_id=' + bid).then(r => r.json()).catch(() => ({ alerts: [] }))
    setExpiry(r.alerts ?? [])
    setExpiryLoading(false)
  }, [bid])

  useEffect(() => {
    if (tab === 'overview') loadOverview()
    else if (tab === 'replenish') loadReplenish()
    else if (tab === 'orders') loadOrders()
    else if (tab === 'transfers') loadTransfers()
    else if (tab === 'dead-stock') loadDead()
    else if (tab === 'expiry') loadExpiry()
  }, [tab, loadOverview, loadReplenish, loadOrders, loadTransfers, loadDead, loadExpiry])

  async function pullToFloor(item: ReplenishItem) {
    if (!bid || pulling.has(item.id)) return
    setPulling(prev => new Set(prev).add(item.id))
    await fetch('/api/pos/products/' + item.id + '?action=update_general', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qty_backroom: Math.max(0, item.backroom_qty - item.pull_qty) }) })
    setPulling(prev => { const s = new Set(prev); s.delete(item.id); return s })
    loadReplenish()
  }

  async function expiryAction(alert: ExpiryAlert, action: 'mark_down' | 'write_off') {
    if (!bid) return
    setActioning(alert.id)
    await fetch('/api/pos/expiry-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, product_id: alert.product_id, alert_id: alert.id, business_id: bid, markdown_pct: 30, write_off_qty: alert.stock_quantity }) })
    setActioning(null)
    loadExpiry()
  }

  // Overview KPIs
  const stockValue = stockItems.reduce((s, i) => s + (i.value_cents ?? 0) / 100, 0)
  const lowStockCount = stockItems.filter(i => i.needs_reorder).length
  const top10 = [...stockItems].sort((a, b) => (b.value_cents ?? 0) - (a.value_cents ?? 0)).slice(0, 10)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'replenish', label: 'Replenishment' + (replenish.length > 0 ? ' (' + replenish.length + ')' : '') },
    { id: 'orders', label: 'Purchase Orders' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'dead-stock', label: 'Dead Stock' },
    { id: 'expiry', label: 'Expiry' + (expiry.length > 0 ? ' (' + expiry.length + ')' : '') },
  ]

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Warehouse</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Stock control, replenishment, purchase orders, and expiry management.</p>
        </div>
        <Link href="/dashboard/warehouse/stock" style={{ fontSize: 12, color: C.muted, textDecoration: 'none', padding: '7px 14px', borderRadius: 9, border: '1px solid ' + C.border }}>Stock detail →</Link>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid ' + C.border, marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '10px 18px', background: 'none', border: 'none', borderBottom: '2px solid ' + (tab === t.id ? C.violet : 'transparent'), color: tab === t.id ? C.violet : C.muted, fontSize: 13, fontWeight: tab === t.id ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total stock value', value: fmt(stockValue), color: C.teal },
              { label: 'Low stock products', value: String(lowStockCount), color: lowStockCount > 0 ? C.amber : C.green },
              { label: 'Total products tracked', value: String(stockItems.length), color: C.text },
            ].map(k => (
              <div key={k.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{stockLoading ? '…' : k.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid ' + C.border }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Top 10 by stock value</p>
            </div>
            {stockLoading ? <div style={{ padding: 24, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div> : top10.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.dim, fontSize: 13 }}>No stock data</div> : top10.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: i < top10.length - 1 ? '1px solid ' + C.border : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: C.dim, width: 20, textAlign: 'right' }}>{i + 1}</span>
                  <div>
                    <p style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{item.name}</p>
                    <p style={{ fontSize: 10, color: C.dim }}>{item.sku ?? ''} · {item.stock} units</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmt((item.value_cents ?? 0) / 100)}</p>
                  {item.needs_reorder && <p style={{ fontSize: 10, color: C.amber }}>Reorder needed</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* REPLENISHMENT */}
      {tab === 'replenish' && (
        <div>
          {replenishLoading ? <div style={{ textAlign: 'center', color: C.muted, padding: '60px 0' }}>Loading…</div>
            : replenish.length === 0 ? <div style={{ textAlign: 'center', padding: '60px 0' }}><p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>✓ All shelves stocked</p><p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>No products need pulling from the backroom.</p></div>
            : replenish.map(item => (
              <div key={item.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>{item.name}</p>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: item.fill_pct < 10 ? C.red : C.amber, width: item.fill_pct + '%' }} />
                  </div>
                  <p style={{ fontSize: 11, color: C.dim }}>Floor: {item.floor_qty}/{item.shelf_capacity} · {item.fill_pct}% full · Backroom: {item.backroom_qty}</p>
                </div>
                <button onClick={() => pullToFloor(item)} disabled={pulling.has(item.id)}
                  style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, cursor: pulling.has(item.id) ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: pulling.has(item.id) ? 0.6 : 1, minWidth: 44, minHeight: 44 }}>
                  Pull {item.pull_qty} to floor
                </button>
              </div>
            ))}
        </div>
      )}

      {/* PURCHASE ORDERS */}
      {tab === 'orders' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Link href="/dashboard/warehouse/purchase-orders" style={{ padding: '8px 18px', borderRadius: 9, background: C.teal, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Open full PO manager →</Link>
          </div>
          {ordersLoading ? <div style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>Loading…</div>
            : orders.slice(0, 10).map(po => (
              <div key={po.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>{po.po_number}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(139,92,246,0.15)', color: C.violet }}>{po.status}</span>
                  </div>
                  <p style={{ fontSize: 11, color: C.dim }}>{po.supplier_name ?? '—'} · {new Date(po.created_at).toLocaleDateString()} · {(po.line_items ?? []).length} items</p>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmt((po.total_cost_cents ?? 0) / 100)}</p>
              </div>
            ))}
        </div>
      )}

      {/* TRANSFERS */}
      {tab === 'transfers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Link href="/dashboard/warehouse/transfers" style={{ padding: '8px 18px', borderRadius: 9, background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Create transfer →</Link>
          </div>
          {transfersLoading ? <div style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>Loading…</div>
            : transfers.length === 0 ? <div style={{ textAlign: 'center', color: C.dim, padding: '40px 0', fontSize: 13 }}>No transfers yet</div>
            : transfers.slice(0, 20).map(t => (
              <div key={t.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '12px 18px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{t.product?.name ?? '—'}</p>
                  <p style={{ fontSize: 11, color: C.dim }}>{t.from_outlet?.name ?? 'Central'} → {t.to_outlet?.name ?? '—'} · {new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t.qty} units</p>
                  <p style={{ fontSize: 10, color: t.status === 'completed' ? C.green : C.amber }}>{t.status}</p>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* DEAD STOCK */}
      {tab === 'dead-stock' && (
        <div>
          {deadLoading ? <div style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>Loading…</div>
            : dead.length === 0 ? <div style={{ textAlign: 'center', color: C.dim, padding: '40px 0', fontSize: 13 }}>No dead stock found</div>
            : dead.slice(0, 20).map(item => (
              <div key={item.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: C.dim }}>{item.stock_quantity} units · Last sold: {item.days_since > 999 ? 'Never' : item.days_since + ' days ago'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{fmt(item.value_cost)}</p>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', color: C.amber }}>{item.suggested_action}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* EXPIRY */}
      {tab === 'expiry' && (
        <div>
          {expiryLoading ? <div style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>Loading…</div>
            : expiry.length === 0 ? <div style={{ textAlign: 'center', color: C.dim, padding: '40px 0', fontSize: 13 }}>No expiry alerts</div>
            : expiry.map(alert => (
              <div key={alert.id} style={{ background: C.card, border: '1px solid ' + (alert.days_until_expiry <= 3 ? C.red : alert.days_until_expiry <= 7 ? C.amber : C.border), borderRadius: 12, padding: '14px 18px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{alert.product_name}</p>
                  <p style={{ fontSize: 11, color: alert.days_until_expiry <= 3 ? C.red : alert.days_until_expiry <= 7 ? C.amber : C.muted }}>
                    Expires in <strong>{alert.days_until_expiry}</strong> day{alert.days_until_expiry !== 1 ? 's' : ''}{alert.expiry_date ? ' (' + alert.expiry_date + ')' : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => expiryAction(alert, 'mark_down')} disabled={actioning === alert.id}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: C.amber, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, opacity: actioning === alert.id ? 0.6 : 1 }}>
                    −30% Markdown
                  </button>
                  <button onClick={() => expiryAction(alert, 'write_off')} disabled={actioning === alert.id}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, opacity: actioning === alert.id ? 0.6 : 1 }}>
                    Write off
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
