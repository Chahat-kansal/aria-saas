'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Package, Plus, Trash2, Eye, Pencil } from 'lucide-react'

interface Order {
  id: string; order_number: string; status: string; source: string;
  supplier_name: string | null; total_estimated: number | null;
  created_by: string | null; created_at: string;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:     { bg: 'rgba(212,169,94,0.12)', color: 'var(--warning,#D4A95E)' },
  sent:      { bg: 'rgba(107,150,176,0.12)', color: 'var(--info,#6B96B0)' },
  received:  { bg: 'rgba(127,184,151,0.12)', color: 'var(--success,#65B179)' },
  cancelled: { bg: 'rgba(201,112,112,0.12)', color: 'var(--destructive,#C97070)' },
}
const SOURCE_LABEL: Record<string, string> = { manual: 'Manual', auto_reorder: 'Auto-Reorder', agent: 'Agent' }

const TABS = ['all', 'draft', 'sent', 'received', 'cancelled'] as const

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pos/orders').then(r => r.json()).then(d => {
      setOrders(d.orders ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function deleteOrder(id: string) {
    if (!confirm('Delete this draft order? This cannot be undone.')) return
    setDeleting(id)
    await fetch(`/api/pos/orders/${id}`, { method: 'DELETE' })
    setOrders(os => os.filter(o => o.id !== id))
    setDeleting(null)
  }

  const filtered = activeTab === 'all' ? orders : orders.filter(o => o.status === activeTab)

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px' }}>Purchase Orders</h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>{orders.length} total</p>
        </div>
        <Link href="/pos/orders/new" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, background: 'var(--violet)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
          <Plus size={14} /> New Order
        </Link>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)', padding: '0 24px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding: '11px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === t ? 'var(--violet)' : 'transparent'}`, color: activeTab === t ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 13, fontWeight: activeTab === t ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <Package size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No purchase orders yet</p>
          <p style={{ fontSize: 13, margin: '0 0 20px' }}>Create your first order or set up auto-reorder to let Aria prepare weekly orders.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href="/pos/orders/new" style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--violet)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>New Order</Link>
            <Link href="/pos/settings/reorder-schedule" style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--divider)', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Set up Schedule</Link>
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                {['Order #', 'Date', 'Supplier', 'Est. Total', 'Source', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const ss = STATUS_STYLE[o.status] ?? STATUS_STYLE.draft
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                      <Link href={`/pos/orders/${o.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{o.order_number}</Link>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{new Date(o.created_at).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{o.supplier_name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono',monospace" }}>{o.total_estimated != null ? `$${Number(o.total_estimated).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: 11 }}>{SOURCE_LABEL[o.source] ?? o.source}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: ss.bg, color: ss.color, textTransform: 'capitalize' }}>{o.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Link href={`/pos/orders/${o.id}`} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--divider)', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Eye size={11} /> View
                        </Link>
                        {o.status === 'draft' && (
                          <>
                            <Link href={`/pos/orders/new?edit=${o.id}`} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(127,184,151,0.3)', color: 'var(--violet)', textDecoration: 'none', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Pencil size={11} /> Edit
                            </Link>
                            <button onClick={() => deleteOrder(o.id)} disabled={deleting === o.id} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(201,112,112,0.25)', background: 'rgba(201,112,112,0.06)', color: 'var(--destructive)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {deleting === o.id ? '…' : <Trash2 size={11} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
