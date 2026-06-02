'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, Mail, FileText } from 'lucide-react'

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
  items: OrderItem[]
  customer: Customer | null
  business_id: string
}

const C = {
  bg: '#0E1411',
  card: 'rgba(255,255,255,0.03)',
  raised: 'rgba(255,255,255,0.05)',
  accent: '#7FB897',
  forest: '#2D5240',
  border: 'rgba(255,255,255,0.08)',
  text: '#fff',
  muted: 'rgba(255,255,255,0.6)',
  tertiary: 'rgba(255,255,255,0.35)',
  danger: '#f87171',
}

export default function WholesaleReviewPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<WholesaleOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) return
    fetch('/api/wholesale/orders/' + orderId)
      .then(r => r.json())
      .then(data => {
        setOrder(data.order ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [orderId])

  async function handleGenerateAndSend() {
    if (!order) return
    setSending(true)
    setSendError(null)

    try {
      // Generate invoice
      const genRes = await fetch('/api/wholesale/orders/' + orderId + '/generate-invoice', { method: 'POST' })
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}))
        setSendError((err as { error?: string }).error ?? 'Invoice generation failed')
        setSending(false)
        return
      }

      // Send email
      const sendRes = await fetch('/api/wholesale/orders/' + orderId + '/send', { method: 'POST' })
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        setSendError((err as { error?: string }).error ?? 'Send failed')
        setSending(false)
        return
      }

      setSending(false)
      setShowConfirmModal(false)
      router.push('/dashboard/wholesale/' + orderId)
    } catch {
      setSendError('An unexpected error occurred')
      setSending(false)
    }
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

  const today = new Date().toLocaleDateString('en-AU')
  const dueDate = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-AU')
  const custName = order.customer?.business_name || order.customer?.name || 'Wholesale Customer'

  // Invoice HTML preview
  const itemRowsHtml = order.items.map(item => {
    const discPct = item.discount_pct || 0
    return (
      <tr key={item.id} style={{ borderBottom: '1px solid #e8f0eb' }}>
        <td style={{ padding: '8px 12px', fontSize: 13 }}>
          {item.sku && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#666', marginRight: 6 }}>{item.sku}</span>}
          {item.name}
          {item.description && <><br /><span style={{ fontSize: 11, color: '#888' }}>{item.description}</span></>}
        </td>
        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'center' }}>{item.quantity}</td>
        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right' }}>${(Number(item.retail_price) || 0).toFixed(2)}</td>
        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right' }}>${(Number(item.unit_price) || 0).toFixed(2)}</td>
        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'center' }}>{discPct > 0 ? discPct + '%' : '—'}</td>
        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>${(Number(item.line_total) || 0).toFixed(2)}</td>
      </tr>
    )
  })

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: C.bg }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => router.push('/dashboard/wholesale/new?orderId=' + orderId)}
          style={{ background: 'transparent', border: '1px solid ' + C.border, borderRadius: 8, padding: '6px 12px', color: C.muted, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ChevronLeft size={12} /> Back to edit
        </button>
        <h1 style={{ margin: 0, fontSize: 18, color: C.text, fontFamily: 'Cormorant, serif', fontStyle: 'italic' }}>
          Review order {order.order_number}
        </h1>
      </div>

      {/* Invoice preview */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '32px 40px',
        marginBottom: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, borderBottom: '3px solid #2D5240', paddingBottom: 20 }}>
          <div>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#2D5240', color: '#7FB897', fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              W
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2D5240', margin: '0 0 2px' }}>TAX INVOICE</h2>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>Preview — not yet generated</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#2D5240', margin: 0 }}>{order.order_number}</p>
            <p style={{ fontSize: 12, color: '#666', margin: '2px 0' }}>Issue date: {today}</p>
            <p style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, margin: 0 }}>Due: {dueDate}</p>
          </div>
        </div>

        {/* 3-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#f5faf7', borderRadius: 6, padding: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#2D5240', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Bill To</p>
            {order.customer?.business_name && <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px', color: '#1a1a1a' }}>{order.customer.business_name}</p>}
            {order.customer?.name && <p style={{ fontSize: 12, margin: '0 0 2px', color: '#555' }}>{order.customer.name}</p>}
            {order.customer?.email && <p style={{ fontSize: 12, margin: 0, color: '#555' }}>{order.customer.email}</p>}
            {order.customer?.billing_address && <p style={{ fontSize: 11, marginTop: 4, color: '#777' }}>{order.customer.billing_address}</p>}
          </div>
          <div style={{ background: '#f5faf7', borderRadius: 6, padding: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#2D5240', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Ship To</p>
            <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{order.delivery_address || order.customer?.shipping_address || '—'}</p>
            {order.delivery_notes && <p style={{ fontSize: 11, fontStyle: 'italic', marginTop: 4, color: '#777' }}>{order.delivery_notes}</p>}
          </div>
          <div style={{ background: '#f5faf7', borderRadius: 6, padding: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#2D5240', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Order Details</p>
            <p style={{ fontSize: 12, margin: '0 0 2px', color: '#555' }}><strong>Terms:</strong> {order.payment_terms || 'Net 14'}</p>
            {order.po_ref && <p style={{ fontSize: 12, margin: '0 0 2px', color: '#555' }}><strong>PO Ref:</strong> {order.po_ref}</p>}
            {order.delivery_date && <p style={{ fontSize: 12, margin: 0, color: '#555' }}><strong>Delivery:</strong> {new Date(order.delivery_date).toLocaleDateString('en-AU')}</p>}
            {order.customer?.abn && <p style={{ fontSize: 12, marginTop: 2, color: '#555' }}><strong>ABN:</strong> {order.customer.abn}</p>}
          </div>
        </div>

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#2D5240', color: '#fff' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12 }}>Product</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12 }}>Qty</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12 }}>RRP</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12 }}>Wholesale</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12 }}>Disc</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12 }}>Line Total</th>
            </tr>
          </thead>
          <tbody>{itemRowsHtml}</tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <div style={{ width: 280, border: '1px solid #e8f0eb', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', padding: '4px 0' }}>
              <span>Subtotal</span><span>${(Number(order.subtotal) || 0).toFixed(2)}</span>
            </div>
            {Number(order.discount_total) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#2D5240', padding: '4px 0' }}>
                <span>Customer discount</span><span>−${(Number(order.discount_total) || 0).toFixed(2)}</span>
              </div>
            )}
            {Number(order.freight) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', padding: '4px 0' }}>
                <span>Freight</span><span>${(Number(order.freight) || 0).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', padding: '4px 0' }}>
              <span>GST (10%)</span><span>${(Number(order.gst_total) || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '2px solid #2D5240', marginTop: 8, paddingTop: 10 }}>
              <span>Total AUD</span><span>${(Number(order.total) || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment block */}
        <div style={{ background: '#f5faf7', borderRadius: 8, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#2D5240', marginBottom: 10 }}>Payment Information</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#1a1a1a' }}>Bank Transfer</p>
              <p style={{ fontSize: 12, color: '#555' }}>Reference your invoice number when paying.</p>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#1a1a1a' }}>Terms</p>
              <p style={{ fontSize: 12, color: '#555' }}>{order.payment_terms || 'Net 14'}. Payment due by {dueDate}.</p>
            </div>
          </div>
          {order.notes && (
            <p style={{ fontSize: 12, color: '#555', marginTop: 12, borderTop: '1px solid #ddd', paddingTop: 10 }}>
              <strong>Notes:</strong> {order.notes}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        <button
          onClick={() => setShowConfirmModal(true)}
          style={{
            width: '100%', padding: '12px', background: C.forest, color: C.accent,
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Mail size={16} /> Generate invoice + send to {order.customer?.email || custName}
        </button>

        <button
          onClick={() => {
            fetch('/api/wholesale/orders/' + orderId + '/generate-invoice', { method: 'POST' })
              .then(() => router.push('/dashboard/wholesale'))
          }}
          style={{
            width: '100%', padding: '12px', background: 'transparent', color: C.muted,
            border: '1px solid ' + C.border, borderRadius: 8, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <FileText size={14} /> Generate invoice only (save as draft)
        </button>

        <button
          onClick={() => router.push('/dashboard/wholesale')}
          style={{
            width: '100%', padding: '12px', background: 'transparent', color: C.tertiary,
            border: '1px solid ' + C.border, borderRadius: 8, fontSize: 13, cursor: 'pointer',
          }}
        >
          Save as draft
        </button>
      </div>

      {/* Confirmation modal */}
      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1a2820', borderRadius: 16, padding: 24, width: 420, maxWidth: '100%', border: '1px solid ' + C.border }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16, color: C.text }}>Confirm and send invoice</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
              This will generate a tax invoice and email it to{' '}
              <strong style={{ color: C.text }}>{order.customer?.email || 'the customer'}</strong>.
              The order status will update to &quot;sent&quot;.
            </p>
            {sendError && (
              <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: C.danger, margin: 0 }}>{sendError}</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowConfirmModal(false); setSendError(null) }}
                disabled={sending}
                style={{ padding: '8px 16px', background: 'transparent', color: C.muted, border: '1px solid ' + C.border, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateAndSend}
                disabled={sending}
                style={{ padding: '8px 20px', background: C.forest, color: C.accent, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending ? 0.7 : 1 }}
              >
                {sending ? 'Sending...' : 'Confirm & send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
