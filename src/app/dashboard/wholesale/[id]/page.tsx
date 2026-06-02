'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Mail, FileText, ChevronLeft, Clock, DollarSign, AlertCircle, Package, Eye } from 'lucide-react'

interface OrderItem {
  id: string
  name: string
  description: string | null
  sku: string | null
  quantity: number
  unit_price: number
  retail_price: number
  discount_pct: number
  discount_amount: number
  line_total: number
  gst_amount: number
}

interface Customer {
  id: string
  name: string
  email: string | null
  business_name: string | null
  business_abn: string | null
  abn: string | null
  billing_address: string | null
  shipping_address: string | null
}

interface WholesaleOrder {
  id: string
  order_number: string
  status: string
  po_ref: string | null
  delivery_date: string | null
  delivery_address: string | null
  delivery_notes: string | null
  payment_terms: string
  subtotal: number
  discount_total: number
  freight: number
  gst_total: number
  total: number
  notes: string | null
  invoice_id: string | null
  created_at: string
  confirmed_at: string | null
  sent_at: string | null
  cancelled_at: string | null
  items: OrderItem[]
  customer: Customer | null
  business_id: string
}

interface AriaIntel {
  notices: string[]
  actions: string[]
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
    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function formatAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const d = Math.floor(diff / 86400000)
  if (d > 0) return d + 'd ago'
  const h = Math.floor(diff / 3600000)
  if (h > 0) return h + 'h ago'
  return Math.floor(diff / 60000) + 'm ago'
}

export default function WholesaleOrderDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<WholesaleOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [aria, setAria] = useState<AriaIntel | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  function loadOrder() {
    if (!orderId) return
    fetch('/api/wholesale/orders/' + orderId)
      .then(r => r.json())
      .then(data => {
        setOrder(data.order ?? null)
        setLoading(false)
        // Load aria intelligence for this business
        if (data.order?.business_id) {
          fetch('/api/wholesale/aria-intelligence?business_id=' + data.order.business_id)
            .then(r => r.json())
            .then(setAria)
            .catch(() => null)
        }
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadOrder() }, [orderId])

  async function handleSendInvoice() {
    if (!order) return
    setActionLoading('send')
    await fetch('/api/wholesale/orders/' + orderId + '/send', { method: 'POST' })
    setActionLoading(null)
    loadOrder()
  }

  async function handleMarkPaid() {
    if (!order) return
    setActionLoading('paid')
    await fetch('/api/wholesale/orders/' + orderId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    if (order.invoice_id) {
      await fetch('/api/invoices/' + order.invoice_id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() }),
      })
    }
    setActionLoading(null)
    loadOrder()
  }

  async function handleDuplicate() {
    if (!order) return
    setActionLoading('dup')
    const res = await fetch('/api/wholesale/orders/from-last', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: order.business_id, customer_id: order.customer?.id }),
    }).then(r => r.json())
    setActionLoading(null)
    if (res.order?.id) router.push('/dashboard/wholesale/' + res.order.id)
  }

  async function handleCancel() {
    if (!order) return
    setCancelling(true)
    await fetch('/api/wholesale/orders/' + orderId, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancelled_reason: cancelReason }),
    })
    setCancelling(false)
    setShowCancelModal(false)
    loadOrder()
  }

  if (loading) {
    return (
      <div style={{ padding: 24, background: C.bg, minHeight: '100vh' }}>
        <p style={{ color: C.muted, fontSize: 13 }}>Loading order...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div style={{ padding: 24, background: C.bg, minHeight: '100vh' }}>
        <p style={{ color: C.muted, fontSize: 13 }}>Order not found.</p>
        <button onClick={() => router.push('/dashboard/wholesale')} style={{ color: C.accent, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}>
          ← Back to wholesale
        </button>
      </div>
    )
  }

  const custName = order.customer?.business_name || order.customer?.name || 'Customer'
  const today = new Date().toLocaleDateString('en-AU')
  const dueDate = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-AU')

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: C.bg }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => router.push('/dashboard/wholesale')}
          style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, padding: '6px 12px', color: C.muted, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ChevronLeft size={12} /> Wholesale
        </button>
      </div>

      {/* Order header card */}
      <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFamily: 'JetBrains Mono, monospace' }}>{order.order_number}</span>
              <StatusBadge status={order.status} />
            </div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{custName}</div>
            {order.customer?.email && <div style={{ fontSize: 12, color: C.muted }}>{order.customer.email}</div>}
            <div style={{ fontSize: 11, color: C.tertiary, marginTop: 4 }}>Created {formatAgo(order.created_at)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: 'Cormorant, serif' }}>${(Number(order.total) || 0).toFixed(2)}</div>
            <div style={{ fontSize: 11, color: C.muted }}>AUD inc. GST</div>
          </div>
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {order.status !== 'cancelled' && order.status !== 'paid' && (
          <button
            onClick={handleSendInvoice}
            disabled={actionLoading === 'send'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: C.forest, color: C.accent, border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Mail size={12} /> {actionLoading === 'send' ? 'Sending...' : 'Send invoice'}
          </button>
        )}

        {order.status !== 'paid' && order.status !== 'cancelled' && (
          <button
            onClick={handleMarkPaid}
            disabled={actionLoading === 'paid'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'rgba(127,184,151,0.1)', color: C.accent,
              border: '1px solid ' + C.borderActive, borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <DollarSign size={12} /> {actionLoading === 'paid' ? 'Updating...' : 'Mark paid'}
          </button>
        )}

        {order.customer?.id && (
          <button
            onClick={handleDuplicate}
            disabled={actionLoading === 'dup'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'transparent', color: C.muted,
              border: '1px solid ' + C.border, borderRadius: 8,
              fontSize: 12, cursor: 'pointer',
            }}
          >
            {actionLoading === 'dup' ? 'Duplicating...' : 'Duplicate'}
          </button>
        )}

        {order.invoice_id && (
          <a
            href={'/api/invoices/' + order.invoice_id}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'transparent', color: C.muted,
              border: '1px solid ' + C.border, borderRadius: 8,
              fontSize: 12, cursor: 'pointer', textDecoration: 'none',
            }}
          >
            <FileText size={12} /> View invoice
          </a>
        )}

        {order.status !== 'cancelled' && order.status !== 'paid' && (
          <button
            onClick={() => setShowCancelModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'rgba(248,113,113,0.08)', color: C.danger,
              border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8,
              fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel order
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Invoice preview */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Inline invoice preview — matches mockup exactly */}
          <div style={{ background: '#ffffff', borderRadius: 12, padding: '28px 32px', marginBottom: 16, boxShadow: '0 2px 24px rgba(0,0,0,0.18)', color: '#111', fontFamily: '-apple-system, Helvetica Neue, Arial, sans-serif' }}>

            {/* Header: logo + biz + invoice number + badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#2D5240', color: '#7FB897', fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {(order.business_name || 'A').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 600, color: '#111' }}>{order.business_name || 'Your Business'}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.5 }}>
                    {order.business_abn ? `ABN ${order.business_abn} · ` : ''}Tax Invoice · GST registered
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tax invoice</p>
                <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: '#111' }}>{order.invoice_number || order.order_number}</p>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#fef9c3', color: '#854d0e', fontWeight: 500 }}>Awaiting payment</span>
              </div>
            </div>

            <div style={{ height: 1, background: '#e5e7eb', marginBottom: 20 }} />

            {/* Bill to / Ship to / Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <p style={{ margin: '0 0 7px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bill to</p>
                {order.customer?.business_name && <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 500, color: '#111' }}>{order.customer.business_name}</p>}
                {order.customer?.abn && <p style={{ margin: '0 0 2px', fontSize: 11, color: '#555' }}>ABN {order.customer.abn}</p>}
                {order.customer?.name && <p style={{ margin: '0 0 2px', fontSize: 11, color: '#555' }}>Attn: {order.customer.name}</p>}
                {order.customer?.billing_address && <p style={{ margin: '0 0 2px', fontSize: 11, color: '#555' }}>{order.customer.billing_address}</p>}
                {order.customer?.email && <p style={{ margin: 0, fontSize: 11, color: '#555' }}>{order.customer.email}</p>}
              </div>
              <div>
                <p style={{ margin: '0 0 7px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ship to</p>
                <p style={{ margin: 0, fontSize: 11, color: '#555', lineHeight: 1.6 }}>{order.delivery_address || order.customer?.shipping_address || '—'}</p>
                {order.delivery_notes && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#888', fontStyle: 'italic' }}>{order.delivery_notes}</p>}
              </div>
              <div>
                <p style={{ margin: '0 0 7px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Details</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', margin: 0 }}>
                  {[
                    ['Issued', today],
                    ['Due', dueDate],
                    ['Terms', order.payment_terms || 'Net 14'],
                    ...(order.po_ref ? [['PO ref', order.po_ref]] : []),
                    ['Order ID', order.order_number],
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ fontSize: 11, color: '#888', padding: '2px 0', border: 'none' }}>{label}</td>
                      <td style={{ fontSize: 11, color: '#111', padding: '2px 0', textAlign: 'right', border: 'none', fontWeight: label === 'Due' ? 600 : 400 }}>{val}</td>
                    </tr>
                  ))}
                </table>
              </div>
            </div>

            {/* Line items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr style={{ background: '#f8faf8', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                  {[['SKU', 'left', 72], ['Description', 'left', null], ['Qty', 'right', 40], ['Unit price', 'right', 80], ['Disc.', 'right', 50], ['Line total', 'right', 80]].map(([h, align, w]) => (
                    <th key={h as string} style={{ padding: '8px 10px', fontSize: 10, fontWeight: 600, color: '#666', textAlign: align as 'left'|'right', textTransform: 'uppercase', letterSpacing: '0.06em', width: w ? w + 'px' : undefined }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eef2ee' }}>
                    <td style={{ padding: '10px 10px', fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{item.sku || '—'}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{item.name}</span>
                      {item.description && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{item.description}</div>}
                    </td>
                    <td style={{ padding: '10px 10px', fontSize: 13, textAlign: 'right', color: '#111' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 10px', fontSize: 13, textAlign: 'right', color: '#111' }}>${(Number(item.unit_price) || 0).toFixed(2)}</td>
                    <td style={{ padding: '10px 10px', fontSize: 13, textAlign: 'right', color: Number(item.discount_pct) > 0 ? '#166534' : '#aaa' }}>
                      {Number(item.discount_pct) > 0 ? Number(item.discount_pct).toFixed(0) + '%' : '—'}
                    </td>
                    <td style={{ padding: '10px 10px', fontSize: 13, fontWeight: 500, textAlign: 'right', color: '#111' }}>${(Number(item.line_total) || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Notes + Totals side by side */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, paddingTop: 8 }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 7px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</p>
                <p style={{ margin: 0, fontSize: 12, color: '#555', lineHeight: 1.6 }}>{order.notes || 'Thank you for your order.'}</p>
              </div>
              <div style={{ width: 240 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555', padding: '4px 0' }}><span>Subtotal (excl. GST)</span><span>${(Number(order.subtotal) || 0).toFixed(2)}</span></div>
                {Number(order.discount_total) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#166534', padding: '4px 0' }}><span>Discount</span><span>−${(Number(order.discount_total) || 0).toFixed(2)}</span></div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555', padding: '4px 0' }}><span>Freight</span><span>${(Number(order.freight) || 0).toFixed(2)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555', padding: '4px 0' }}><span>GST (10%)</span><span>${(Number(order.gst_total) || 0).toFixed(2)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: '#111', borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 9 }}><span>Total inc. GST</span><span>${(Number(order.total) || 0).toFixed(2)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', marginTop: 10, background: '#fef9c3', borderRadius: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#854d0e' }}>Amount due</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#854d0e' }}>${(Number(order.total) || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Payment block */}
            <div style={{ marginTop: 24, padding: '16px 20px', background: '#f8faf8', borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bank transfer</p>
                <p style={{ margin: 0, fontSize: 11, color: '#444', lineHeight: 1.7, fontFamily: 'monospace' }}>Reference: {order.invoice_number || order.order_number}<br />Due by: {dueDate}</p>
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pay online</p>
                <p style={{ margin: 0, fontSize: 11, color: '#555', lineHeight: 1.6 }}>Card or PayID — secure link sent via email with this invoice.</p>
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Terms</p>
                <p style={{ margin: 0, fontSize: 11, color: '#555', lineHeight: 1.6 }}>{order.payment_terms || 'Net 14'}. 2% late fee per month after due date.</p>
              </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
              <span>Questions? Contact us about this invoice</span>
              <span>Generated by Aria · ariaos.site</span>
            </div>
          </div>

          {/* Activity log */}
          <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Clock size={13} color={C.accent} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Activity</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.tertiary, marginTop: 4, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: C.muted }}>
                  <span style={{ color: C.text }}>Created</span> · {formatAgo(order.created_at)}
                </div>
              </div>
              {order.confirmed_at && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.info, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ fontSize: 12, color: C.muted }}>
                    <span style={{ color: C.text }}>Confirmed</span> · {formatAgo(order.confirmed_at)}
                  </div>
                </div>
              )}
              {order.sent_at && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.warning, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ fontSize: 12, color: C.muted }}>
                    <span style={{ color: C.text }}>Invoice sent</span> · {formatAgo(order.sent_at)}
                  </div>
                </div>
              )}
              {order.cancelled_at && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.danger, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ fontSize: 12, color: C.muted }}>
                    <span style={{ color: C.text }}>Cancelled</span> · {formatAgo(order.cancelled_at)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aria intelligence panel */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <AlertCircle size={13} color={C.accent} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>Aria notices</span>
            </div>
            {aria ? (
              <div>
                {aria.notices.slice(0, 2).map((notice, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.muted, padding: '6px 0', borderBottom: '1px solid ' + C.border }}>
                    {notice}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: C.muted }}>Loading intelligence...</p>
            )}
          </div>

          {order.invoice_id && (
            <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: 16, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Eye size={13} color={C.muted} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Invoice</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Invoice #{order.invoice_id.slice(-6)}</div>
              <a
                href={'/api/invoices/' + order.invoice_id + '/pdf'}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'block', textAlign: 'center', padding: '7px 12px',
                  background: C.forest, color: C.accent, borderRadius: 8,
                  fontSize: 12, fontWeight: 600, textDecoration: 'none',
                }}
              >
                Download PDF
              </a>
            </div>
          )}

          {/* Order meta */}
          <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>Order info</div>
            {[
              ['Payment terms', order.payment_terms],
              ['PO ref', order.po_ref || '—'],
              ['Delivery', order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('en-AU') : '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid ' + C.border }}>
                <span style={{ color: C.muted }}>{label}</span>
                <span style={{ color: C.text }}>{value}</span>
              </div>
            ))}
            {order.notes && (
              <p style={{ fontSize: 11, color: C.muted, marginTop: 10, fontStyle: 'italic' }}>{order.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1a2820', borderRadius: 16, padding: 24, width: 400, maxWidth: '100%', border: '1px solid ' + C.border }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16, color: C.text }}>Cancel this order?</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>This cannot be undone. The order will be marked as cancelled.</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Reason (optional)</label>
              <input
                style={{ background: C.raised, border: '1px solid ' + C.border, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13, width: '100%', outline: 'none' }}
                placeholder="Customer changed mind, out of stock..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                style={{ padding: '8px 16px', background: 'transparent', color: C.muted, border: '1px solid ' + C.border, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
              >
                Keep order
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ padding: '8px 18px', background: 'rgba(248,113,113,0.1)', color: C.danger, border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: cancelling ? 0.7 : 1 }}
              >
                {cancelling ? 'Cancelling...' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suppress unused icon import warnings */}
      <span style={{ display: 'none' }}><Package size={0} /></span>
    </div>
  )
}
