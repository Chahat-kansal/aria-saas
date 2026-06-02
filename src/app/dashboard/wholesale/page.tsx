'use client'
import { useCallback, useEffect, useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { useRouter } from 'next/navigation'
import { Package, Plus, Search, TrendingUp, Users, DollarSign, AlertCircle, Eye, MoreHorizontal, Mail, FileText } from 'lucide-react'

interface WholesaleOrder {
  id: string
  order_number: string
  status: string
  source: string
  subtotal: number
  discount_total: number
  freight: number
  gst_total: number
  total: number
  created_at: string
  sent_at: string | null
  confirmed_at: string | null
  customer_id: string | null
  invoice_id: string | null
  customers: { id: string; name: string; email: string | null; business_name: string | null } | null
}

interface AriaIntelligence {
  notices: string[]
  actions: string[]
  draft_post: { community: string; instagram: string; facebook: string } | null
}

const C = {
  bg: '#0E1411',
  card: 'rgba(255,255,255,0.03)',
  raised: 'rgba(255,255,255,0.05)',
  accent: '#7FB897',
  forest: '#2D5240',
  border: 'rgba(255,255,255,0.08)',
  borderActive: 'rgba(127,184,151,0.18)',
  text: '#fff',
  muted: 'rgba(255,255,255,0.6)',
  tertiary: 'rgba(255,255,255,0.35)',
  danger: '#f87171',
  warning: '#fbbf24',
  info: '#85b7eb',
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', label: 'Draft' },
  confirmed: { bg: 'rgba(133,183,235,0.15)', color: C.info, label: 'Confirmed' },
  invoiced: { bg: 'rgba(133,183,235,0.15)', color: C.info, label: 'Invoiced' },
  sent: { bg: 'rgba(251,191,36,0.15)', color: C.warning, label: 'Sent' },
  partial: { bg: 'rgba(251,191,36,0.15)', color: C.warning, label: 'Partial' },
  paid: { bg: 'rgba(127,184,151,0.2)', color: C.accent, label: 'Paid' },
  cancelled: { bg: 'rgba(248,113,113,0.15)', color: C.danger, label: 'Cancelled' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span style={{
      fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.5px',
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: '16px 20px',
      border: '1px solid ' + C.border, flex: 1, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'Cormorant, serif' }}>{value}</div>
    </div>
  )
}

const STATUS_TABS = ['all', 'draft', 'confirmed', 'sent', 'paid', 'cancelled'] as const
type StatusTab = typeof STATUS_TABS[number]

export default function WholesalePage() {
  const { business } = useBusinessContext()
  const bid = business?.id
  const router = useRouter()

  const [orders, setOrders] = useState<WholesaleOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [aria, setAria] = useState<AriaIntelligence | null>(null)
  const [ariaLoading, setAriaLoading] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    const params = new URLSearchParams({ business_id: bid, limit: '50' })
    if (statusTab !== 'all') params.set('status', statusTab)
    if (search.trim()) params.set('search', search.trim())
    const res = await fetch('/api/wholesale/orders?' + params).then(r => r.json()).catch(() => ({ orders: [], total: 0 }))
    setOrders(res.orders ?? [])
    setTotal(res.total ?? 0)
    setLoading(false)
  }, [bid, statusTab, search])

  const fetchAria = useCallback(async () => {
    if (!bid) return
    setAriaLoading(true)
    const res = await fetch('/api/wholesale/aria-intelligence?business_id=' + bid).then(r => r.json()).catch(() => null)
    setAria(res)
    setAriaLoading(false)
  }, [bid])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { fetchAria() }, [fetchAria])

  // Compute stats from current orders list
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthRevenue = orders
    .filter(o => ['confirmed', 'invoiced', 'sent', 'partial', 'paid'].includes(o.status) && o.created_at >= monthStart)
    .reduce((s, o) => s + (Number(o.total) || 0), 0)
  const outstanding = orders
    .filter(o => ['sent', 'partial'].includes(o.status))
    .reduce((s, o) => s + (Number(o.total) || 0), 0)
  const activeAccounts = new Set(orders.filter(o => o.customer_id && o.status !== 'cancelled').map(o => o.customer_id)).size
  const avgOrder = orders.filter(o => o.status !== 'draft' && o.status !== 'cancelled').length > 0
    ? orders.filter(o => o.status !== 'draft' && o.status !== 'cancelled').reduce((s, o) => s + (Number(o.total) || 0), 0) /
      orders.filter(o => o.status !== 'draft' && o.status !== 'cancelled').length
    : 0

  async function handleSendInvoice(orderId: string) {
    setActionLoading('send-' + orderId)
    setOpenMenu(null)
    await fetch('/api/wholesale/orders/' + orderId + '/send', { method: 'POST' })
    setActionLoading(null)
    fetchOrders()
  }

  async function handleMarkPaid(orderId: string) {
    setActionLoading('paid-' + orderId)
    setOpenMenu(null)
    await fetch('/api/wholesale/orders/' + orderId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    setActionLoading(null)
    fetchOrders()
  }

  function formatAgo(ts: string) {
    const diff = Date.now() - new Date(ts).getTime()
    const d = Math.floor(diff / 86400000)
    if (d > 0) return d + 'd ago'
    const h = Math.floor(diff / 3600000)
    if (h > 0) return h + 'h ago'
    return Math.floor(diff / 60000) + 'm ago'
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: C.bg }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: C.bg,
        paddingBottom: 16, marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: C.text, fontFamily: 'Cormorant, serif', fontStyle: 'italic' }}>
              Wholesale orders
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>Manage B2B orders, invoices, and accounts</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/wholesale/new')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
              background: C.forest, color: C.accent, border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            New order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="This month revenue" value={'$' + monthRevenue.toLocaleString('en-AU', { maximumFractionDigits: 0 })} icon={TrendingUp} color={C.accent} />
        <StatCard label="Active accounts" value={String(activeAccounts)} icon={Users} color={C.info} />
        <StatCard label="Outstanding" value={'$' + outstanding.toLocaleString('en-AU', { maximumFractionDigits: 0 })} icon={AlertCircle} color={C.warning} />
        <StatCard label="Avg order" value={'$' + avgOrder.toLocaleString('en-AU', { maximumFractionDigits: 0 })} icon={DollarSign} color={C.tertiary} />
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setStatusTab(tab)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid ' + (statusTab === tab ? C.borderActive : C.border),
                  background: statusTab === tab ? 'rgba(127,184,151,0.1)' : 'transparent',
                  color: statusTab === tab ? C.accent : C.muted,
                  textTransform: 'capitalize',
                }}
              >
                {tab}
              </button>
            ))}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
              background: C.raised, borderRadius: 8, padding: '6px 12px',
              border: '1px solid ' + C.border,
            }}>
              <Search size={12} color={C.muted} />
              <input
                style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 12, width: 140 }}
                placeholder="Search order #..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Orders table */}
          {loading ? (
            <p style={{ color: C.muted, fontSize: 13 }}>Loading orders...</p>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: C.muted }}>
              <Package size={40} color={C.tertiary} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, marginBottom: 8 }}>No wholesale orders yet</p>
              <button
                onClick={() => router.push('/dashboard/wholesale/new')}
                style={{
                  padding: '8px 18px', background: C.forest, color: C.accent,
                  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Create your first order
              </button>
            </div>
          ) : (
            <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid ' + C.border }}>
                    {['Order #', 'Customer', 'Status', 'Items', 'Total', 'Created', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: C.tertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => {
                    const custName = order.customers?.business_name || order.customers?.name || '—'
                    return (
                      <tr
                        key={order.id}
                        style={{ borderBottom: '1px solid ' + C.border, cursor: 'pointer' }}
                        onClick={() => router.push('/dashboard/wholesale/' + order.id)}
                      >
                        <td style={{ padding: '12px 14px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: C.accent }}>{order.order_number}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: C.text }}>{custName}</td>
                        <td style={{ padding: '12px 14px' }}><StatusBadge status={order.status} /></td>
                        <td style={{ padding: '12px 14px', fontSize: 12, color: C.muted }}>—</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>${(Number(order.total) || 0).toLocaleString('en-AU', { maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '12px 14px', fontSize: 11, color: C.muted }}>{formatAgo(order.created_at)}</td>
                        <td style={{ padding: '12px 14px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setOpenMenu(openMenu === order.id ? null : order.id)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px 6px', borderRadius: 4 }}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {openMenu === order.id && (
                            <div style={{
                              position: 'absolute', right: 0, top: '100%', zIndex: 20,
                              background: '#1a2820', border: '1px solid ' + C.border,
                              borderRadius: 8, padding: 4, minWidth: 160,
                            }}>
                              <button
                                onClick={() => router.push('/dashboard/wholesale/' + order.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: C.text, fontSize: 12, borderRadius: 6 }}
                              >
                                <Eye size={12} /> View detail
                              </button>
                              <button
                                onClick={() => handleSendInvoice(order.id)}
                                disabled={actionLoading === 'send-' + order.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: C.text, fontSize: 12, borderRadius: 6 }}
                              >
                                <Mail size={12} /> {actionLoading === 'send-' + order.id ? 'Sending...' : 'Send invoice'}
                              </button>
                              {order.invoice_id && (
                                <button
                                  onClick={() => handleMarkPaid(order.id)}
                                  disabled={actionLoading === 'paid-' + order.id}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 12, borderRadius: 6 }}
                                >
                                  <FileText size={12} /> Mark paid
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {total > orders.length && (
                <div style={{ padding: '12px 14px', fontSize: 12, color: C.muted, borderTop: '1px solid ' + C.border }}>
                  Showing {orders.length} of {total} orders
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right rail — Aria intelligence */}
        <div style={{
          width: 280, flexShrink: 0,
          display: 'none',
          // visible on desktop via media query below
        }} className="wholesale-aria-panel">
          <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Package size={14} color={C.accent} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>Aria Intelligence</span>
            </div>
            {ariaLoading ? (
              <p style={{ fontSize: 12, color: C.muted }}>Analysing orders...</p>
            ) : aria ? (
              <div>
                {aria.notices.slice(0, 3).map((notice, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.muted, padding: '6px 0', borderBottom: '1px solid ' + C.border }}>
                    {notice}
                  </div>
                ))}
                {aria.actions.slice(0, 2).map((action, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.text, padding: '8px', background: 'rgba(127,184,151,0.06)', borderRadius: 6, marginTop: 8 }}>
                    {action}
                  </div>
                ))}
                {aria.draft_post?.community && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + C.border }}>
                    <p style={{ fontSize: 10, color: C.tertiary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Draft post (Community)</p>
                    <p style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>{aria.draft_post.community.slice(0, 200)}</p>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: C.muted }}>No intelligence available yet.</p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .wholesale-aria-panel { display: block !important; }
        }
      `}</style>
    </div>
  )
}
