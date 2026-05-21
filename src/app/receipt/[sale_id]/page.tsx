'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface SaleData {
  sale: {
    id: string; sale_number: string; total_amount: number; tax_amount: number
    discount_amount: number; payment_method: string; created_at: string
    customer: { name: string; email: string | null } | null
  }
  items: Array<{ product_name: string; quantity: number; unit_price: number; discount_percent: number; line_total: number }>
  payments: Array<{ payment_method: string; amount: number; reference: string | null }>
  business: { name: string; abn: string | null; phone: string | null; email: string | null; address: string | null } | null
}

export default function ReceiptPortalPage() {
  const params = useParams()
  const saleId = params?.sale_id as string
  const [data, setData] = useState<SaleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!saleId) return
    fetch('/api/public/receipt/' + saleId)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false) })
      .catch(() => { setError('Could not load receipt'); setLoading(false) })
  }, [saleId])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F6F6F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#6B6B6B', fontSize: 14 }}>Loading receipt...</p>
    </div>
  )

  if (error || !data) return (
    <div style={{ minHeight: '100vh', background: '#F6F6F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
        <p style={{ color: '#6B6B6B', fontSize: 14 }}>{error || 'Receipt not found'}</p>
      </div>
    </div>
  )

  const { sale, items, payments, business } = data
  const date = new Date(sale.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: '#F6F6F4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#FFFFFF', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: '#1A1A1A', padding: '24px 24px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>{business?.name ?? 'Receipt'}</div>
          {business?.abn && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>ABN {business.abn}</div>}
          {business?.phone && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{business.phone}</div>}
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Sale info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #EBEBEB' }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Receipt</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>#{sale.sale_number}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Date</div>
              <div style={{ fontSize: 12, color: '#1A1A1A' }}>{date}</div>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 16 }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: i < items.length - 1 ? '1px solid #F0F0F0' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A' }}>{item.product_name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {item.quantity} x A${item.unit_price.toFixed(2)}
                    {item.discount_percent > 0 && <span style={{ color: '#00B140', marginLeft: 6 }}>{item.discount_percent}% off</span>}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', marginLeft: 12 }}>A${item.line_total.toFixed(2)}</div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ background: '#F6F6F4', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            {sale.discount_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#6B6B6B' }}>Discount</span>
                <span style={{ fontSize: 12, color: '#00B140', fontWeight: 600 }}>-A${sale.discount_amount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#6B6B6B' }}>GST (inc.)</span>
              <span style={{ fontSize: 12, color: '#6B6B6B' }}>A${sale.tax_amount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #EBEBEB' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#1A1A1A' }}>A${sale.total_amount.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment */}
          <div style={{ textAlign: 'center', paddingTop: 4, borderTop: '1px solid #EBEBEB' }}>
            <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 4 }}>Paid via {payments.map(p => p.payment_method).join(' + ') || sale.payment_method}</div>
            <div style={{ display: 'inline-block', background: 'rgba(0,177,64,0.1)', color: '#007A2C', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>PAID</div>
          </div>
        </div>

        <div style={{ padding: '12px 24px 20px', textAlign: 'center', borderTop: '1px solid #EBEBEB' }}>
          <p style={{ fontSize: 11, color: '#999' }}>Thank you for your purchase!</p>
          {business?.email && <p style={{ fontSize: 11, color: '#999' }}>Questions? {business.email}</p>}
        </div>
      </div>
    </div>
  )
}
