'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface LineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  gst_applicable: boolean
  line_total: number
}

interface Invoice {
  id: string
  invoice_number: string
  status: string
  issue_date: string | null
  due_date: string | null
  bill_to_name: string
  bill_to_email: string | null
  bill_to_address: string | null
  subtotal: number
  gst_total: number
  total: number
  notes: string | null
  pdf_url: string | null
  paid_at: string | null
}

interface Business {
  name: string
  abn: string | null
  address: string | null
  phone: string | null
  logo_url: string | null
}

export default function PublicInvoicePage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [lines, setLines] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paidLoading, setPaidLoading] = useState(false)
  const [paidMethod, setPaidMethod] = useState<'cash' | 'bank_transfer' | null>(null)
  const [markedPaid, setMarkedPaid] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch('/api/invoices/public/' + id)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setInvoice(d.invoice)
        setBusiness(d.business)
        setLines(d.lines ?? [])
      })
      .catch(() => setError('Failed to load invoice'))
      .finally(() => setLoading(false))
  }, [id])

  async function markPaid(method: 'cash' | 'bank_transfer') {
    if (!invoice || paidLoading) return
    setPaidLoading(true)
    setPaidMethod(method)
    try {
      const res = await fetch('/api/invoices/public/' + id + '/paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      })
      const d = await res.json()
      if (d.ok) setMarkedPaid(true)
    } finally {
      setPaidLoading(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5faf7', fontFamily: 'Arial, sans-serif' }}>
      <p style={{ color: '#555', fontSize: '15px' }}>Loading invoice…</p>
    </div>
  )

  if (error || !invoice || !business) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5faf7', fontFamily: 'Arial, sans-serif' }}>
      <p style={{ color: '#c0392b', fontSize: '15px' }}>{error ?? 'Invoice not found.'}</p>
    </div>
  )

  const issueDate = invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString('en-AU') : ''
  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-AU') : ''
  const isPaid = invoice.status === 'paid' || markedPaid

  const statusColor = isPaid ? '#27ae60' : invoice.status === 'overdue' ? '#c0392b' : '#e67e22'
  const statusLabel = isPaid ? 'PAID' : invoice.status === 'overdue' ? 'OVERDUE' : invoice.status.toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#f5faf7', padding: '32px 16px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', background: '#fff', borderRadius: '10px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            {business.logo_url && (
              <img src={business.logo_url} alt={business.name} style={{ maxHeight: '60px', maxWidth: '180px', objectFit: 'contain', marginBottom: '12px', display: 'block' }} />
            )}
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#2D5240', margin: '0 0 4px' }}>TAX INVOICE</h1>
            <p style={{ margin: '0', fontSize: '17px', fontWeight: 600 }}>{business.name}</p>
            {business.abn && <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>ABN: {business.abn}</p>}
            {business.address && <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>{business.address}</p>}
            {business.phone && <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>{business.phone}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#2D5240' }}>{invoice.invoice_number}</p>
            <span style={{ display: 'inline-block', background: statusColor, color: '#fff', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px' }}>{statusLabel}</span>
            {issueDate && <p style={{ margin: '8px 0 2px', fontSize: '13px', color: '#555' }}>Issued: {issueDate}</p>}
            {dueDate && <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>Due: {dueDate}</p>}
          </div>
        </div>

        {/* Bill to */}
        <div style={{ background: '#f5faf7', borderRadius: '6px', padding: '16px', marginBottom: '24px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bill to</p>
          <p style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 600 }}>{invoice.bill_to_name}</p>
          {invoice.bill_to_email && <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>{invoice.bill_to_email}</p>}
          {invoice.bill_to_address && <p style={{ margin: '2px 0', fontSize: '13px', color: '#555' }}>{invoice.bill_to_address}</p>}
        </div>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <thead>
            <tr style={{ background: '#2D5240', color: '#fff' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '13px' }}>Description</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '13px' }}>Qty</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px' }}>Unit Price</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '13px' }}>GST</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8f0eb', fontSize: '13px' }}>{l.description}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8f0eb', fontSize: '13px', textAlign: 'center' }}>{l.quantity}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8f0eb', fontSize: '13px', textAlign: 'right' }}>${(l.unit_price || 0).toFixed(2)}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8f0eb', fontSize: '13px', textAlign: 'center' }}>{l.gst_applicable ? 'Yes' : 'No'}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #e8f0eb', fontSize: '13px', textAlign: 'right' }}>${(l.line_total || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ marginLeft: 'auto', width: '260px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#555' }}>
            <span>Subtotal (ex-GST)</span><span>${(invoice.subtotal || 0).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#555' }}>
            <span>GST (10%)</span><span>${(invoice.gst_total || 0).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '17px', fontWeight: 700, borderTop: '2px solid #2D5240', marginTop: '6px' }}>
            <span>Total (AUD)</span><span>${(invoice.total || 0).toFixed(2)}</span>
          </div>
        </div>

        {invoice.notes && (
          <p style={{ marginBottom: '24px', fontSize: '13px', color: '#555' }}><strong>Notes:</strong> {invoice.notes}</p>
        )}

        {/* PDF download */}
        {invoice.pdf_url && (
          <div style={{ marginBottom: '24px' }}>
            <a href={invoice.pdf_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '10px 20px', background: '#2D5240', color: '#fff', borderRadius: '6px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
              Download PDF
            </a>
          </div>
        )}

        {/* Mark as paid */}
        {!isPaid && (
          <div style={{ borderTop: '1px solid #e8f0eb', paddingTop: '24px' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#1a1a1a' }}>Mark as paid</p>
            <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>The business owner will confirm receipt separately.</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => markPaid('cash')}
                disabled={paidLoading}
                style={{ padding: '10px 20px', background: paidLoading && paidMethod === 'cash' ? '#a0b8ac' : '#2D5240', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: paidLoading ? 'not-allowed' : 'pointer' }}
              >
                {paidLoading && paidMethod === 'cash' ? 'Marking…' : 'Paid by Cash'}
              </button>
              <button
                onClick={() => markPaid('bank_transfer')}
                disabled={paidLoading}
                style={{ padding: '10px 20px', background: paidLoading && paidMethod === 'bank_transfer' ? '#a0b8ac' : '#2D5240', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: paidLoading ? 'not-allowed' : 'pointer' }}
              >
                {paidLoading && paidMethod === 'bank_transfer' ? 'Marking…' : 'Bank Transfer'}
              </button>
            </div>
          </div>
        )}

        {(isPaid || markedPaid) && (
          <div style={{ borderTop: '1px solid #e8f0eb', paddingTop: '24px', textAlign: 'center' }}>
            <p style={{ color: '#27ae60', fontSize: '15px', fontWeight: 600 }}>Payment received — thank you!</p>
            <p style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>The business will confirm and issue a receipt.</p>
          </div>
        )}

        <p style={{ marginTop: '32px', fontSize: '11px', color: '#bbb', textAlign: 'center' }}>
          Tax invoice for GST purposes. ABN: {business.abn ?? 'N/A'} &mdash; Powered by Aria OS
        </p>
      </div>
    </div>
  )
}
