'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface Line { id: string; product_name: string; product_sku: string | null; product_id: string | null; quantity_cases: number; quantity_items: number; quantity_ordered: number; quantity_received: number | null; receive_status: 'pending' | 'received' | 'partial' | 'not_received' | null; last_purchase_price: number | null; open_market_low: number | null; open_market_high: number | null; open_market_source: string | null; confirmed_price: number | null; line_total: number | null; supplier_name: string | null; is_estimated_cost?: boolean }
interface Order { id: string; order_number: string; status: string; source: string; supplier_name: string | null; notes: string | null; total_estimated: number | null; created_by: string | null; created_at: string; sent_at: string | null; received_at: string | null; lines?: Line[] }

const STATUS_COL: Record<string, string> = { draft: 'var(--warning)', sent: '#6B96B0', received: 'var(--success)', cancelled: 'var(--destructive)' }

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receiveLines, setReceiveLines] = useState<Array<{
    line_id: string; product_id: string | null; product_name: string;
    quantity_ordered: number; quantity_received: number;
    not_received: boolean; expiry_date: string;
  }>>([])

  function openReceiveModal() {
    setReceiveLines((order!.lines ?? []).map(l => ({
      line_id: l.id,
      product_id: l.product_id ?? null,
      product_name: l.product_name,
      quantity_ordered: l.quantity_ordered ?? l.quantity_cases ?? 0,
      quantity_received: l.quantity_ordered ?? l.quantity_cases ?? 0,
      not_received: false,
      expiry_date: '',
    })))
    setShowReceiveModal(true)
  }

  async function handleReceiveAll() {
    if (!order) return
    setActing(true)
    const items = (order.lines ?? []).map(l => ({
      line_id: l.id,
      product_id: l.product_id ?? null,
      received_qty: l.quantity_ordered ?? l.quantity_cases ?? 0,
      expiry_date: null,
      quantity_ordered: l.quantity_ordered ?? l.quantity_cases ?? 0,
    })).filter(i => i.product_id && i.received_qty > 0)

    const res = await fetch('/api/pos/orders/receive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, items }),
    })
    const data = await res.json()
    if (data.ok) {
      const updated = await fetch(`/api/pos/orders/${order.id}`).then(r => r.json())
      if (updated.order) setOrder(updated.order)
    } else {
      alert(data.error ?? 'Failed to receive order')
    }
    setActing(false)
  }

  async function handleReceive() {
    if (!order) return
    setActing(true)
    const items = receiveLines
      .filter(l => !l.not_received && l.quantity_received > 0)
      .map(l => ({
        line_id: l.line_id,
        product_id: l.product_id,
        received_qty: l.quantity_received,
        expiry_date: l.expiry_date || null,
        quantity_ordered: l.quantity_ordered,
      }))

    const res = await fetch('/api/pos/orders/receive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, items }),
    })
    const data = await res.json()
    if (data.ok) {
      const updated = await fetch(`/api/pos/orders/${order.id}`).then(r => r.json())
      if (updated.order) setOrder(updated.order)
      setShowReceiveModal(false)
    } else {
      alert(data.error ?? 'Failed to receive order')
    }
    setActing(false)
  }

  useEffect(() => {
    if (!id) return
    fetch(`/api/pos/orders/${id}`).then(r => r.json()).then(d => { setOrder(d.order ?? null); setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  async function updateStatus(status: string) {
    if (!order) return
    setActing(true)
    const patch: Record<string, string> = { status }
    if (status === 'received') patch.received_at = new Date().toISOString()
    const res = await fetch(`/api/pos/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(r => r.json())
    if (res.order) setOrder(res.order)
    setActing(false)
  }

  async function deleteOrder() {
    if (!confirm('Delete this draft order?')) return
    await fetch(`/api/pos/orders/${id}`, { method: 'DELETE' })
    router.push('/pos/orders')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: "'Manrope',sans-serif" }}>Loading…</div>
  if (!order) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: "'Manrope',sans-serif" }}>Order not found. <Link href="/pos/orders" style={{ color: 'var(--violet)' }}>Back</Link></div>

  const grandTotal = (order.lines ?? []).reduce((s, l) => s + (l.quantity_cases * (l.confirmed_price ?? l.last_purchase_price ?? 0)), 0)
  const grandTotalIsEstimated = (order.lines ?? []).some(l => !l.confirmed_price && l.last_purchase_price)

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/pos/orders" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 12 }}><ArrowLeft size={14} /> Orders</Link>
        <h1 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', fontSize: 22, margin: 0, flex: 1 }}>{order.order_number}</h1>
        <span style={{ padding: '3px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: `${STATUS_COL[order.status]}20`, color: STATUS_COL[order.status], textTransform: 'capitalize' }}>{order.status}</span>
        {order.status === 'draft' && (
          <button onClick={() => updateStatus('sent')} disabled={acting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {acting ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Send size={13} />} Mark Sent
          </button>
        )}
        {order.status === 'sent' && (
          <>
            <button onClick={handleReceiveAll} disabled={acting}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--success,#65B179)', background: 'transparent', color: 'var(--success,#65B179)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {acting ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : 'Receive All'}
            </button>
            <button onClick={openReceiveModal} disabled={acting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--success,#65B179)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {acting ? <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <CheckCircle size={13} />} Mark Received
            </button>
          </>
        )}
        {['draft', 'sent'].includes(order.status) && (
          <button onClick={() => updateStatus('cancelled')} disabled={acting} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(201,112,112,0.3)', background: 'transparent', color: 'var(--destructive)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        )}
        {order.status === 'draft' && (
          <button onClick={deleteOrder} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
        )}
      </div>

      <div style={{ padding: '20px 24px' }}>
        {/* Meta card */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {[
            { label: 'Supplier', value: order.supplier_name ?? 'Multiple' },
            { label: 'Created by', value: order.created_by ?? '—' },
            { label: 'Created', value: new Date(order.created_at).toLocaleDateString('en-AU') },
            { label: 'Source', value: { manual: 'Manual', auto_reorder: 'Auto-Reorder', agent: 'Agent' }[order.source] ?? order.source },
            ...(order.sent_at ? [{ label: 'Sent', value: new Date(order.sent_at).toLocaleDateString('en-AU') }] : []),
            ...(order.received_at ? [{ label: 'Received', value: new Date(order.received_at).toLocaleDateString('en-AU') }] : []),
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Lines table */}
        {(order.lines?.length ?? 0) === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No line items. <Link href={`/pos/orders/new?edit=${order.id}`} style={{ color: 'var(--violet)' }}>Edit order</Link> to add products.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  {['Product', 'Cases', 'Items', 'Last Paid', 'Market Retail Ref', 'Your Price', 'Total'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.lines!.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{l.product_name}</div>
                      {l.product_sku && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{l.product_sku}</div>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{l.quantity_cases}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)' }}>{l.quantity_items || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)' }}>{l.last_purchase_price != null ? `$${Number(l.last_purchase_price).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }} title="Public retail shelf price — not your wholesale cost. Wholesale is typically 55-65% of this figure.">
                      {l.open_market_low != null ? `$${Number(l.open_market_low).toFixed(2)}–$${Number(l.open_market_high ?? l.open_market_low).toFixed(2)} · ${l.open_market_source}` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      {l.confirmed_price != null
                        ? `$${Number(l.confirmed_price).toFixed(2)}`
                        : l.last_purchase_price != null
                          ? <>{`$${Number(l.last_purchase_price).toFixed(2)}`}<span style={{ fontSize: 10, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>Est.</span></>
                          : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', fontSize: 15, color: 'var(--violet)' }}>
                      {(() => {
                        const price = l.confirmed_price ?? l.last_purchase_price
                        return price != null ? `$${(l.quantity_cases * price).toFixed(2)}` : '—'
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', padding: '16px 12px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                Estimated total
                {grandTotalIsEstimated && <span style={{ fontSize: 10, color: '#F59E0B', marginLeft: 5 }}>(estimated)</span>}
              </div>
              <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', fontWeight: 500, fontSize: 28, background: 'linear-gradient(135deg,#9FC9B0,#7FB897)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                ${grandTotal.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {showReceiveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 580, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontStyle: 'italic', fontSize: 22, margin: 0 }}>Receive Delivery</h2>
              <button onClick={() => setShowReceiveModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>Tick items as received, adjust quantities if partial, and optionally add expiry dates.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {receiveLines.map((line, idx) => (
                <div key={line.line_id} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 16px', opacity: line.not_received ? 0.5 : 1, transition: 'opacity 150ms' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: line.not_received ? 0 : 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{line.product_name}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={line.not_received}
                        onChange={e => setReceiveLines(prev => prev.map((l, i) =>
                          i === idx ? { ...l, not_received: e.target.checked, quantity_received: e.target.checked ? 0 : l.quantity_ordered } : l
                        ))} />
                      Not received
                    </label>
                  </div>
                  {!line.not_received && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                          Qty received <span style={{ color: 'var(--text-tertiary)' }}>(ordered: {line.quantity_ordered})</span>
                        </label>
                        <input type="number" min={0} value={line.quantity_received}
                          onChange={e => setReceiveLines(prev => prev.map((l, i) =>
                            i === idx ? { ...l, quantity_received: Math.max(0, parseInt(e.target.value) || 0) } : l
                          ))}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                          Expiry date <span style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                        </label>
                        <input type="date" value={line.expiry_date}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={e => setReceiveLines(prev => prev.map((l, i) =>
                            i === idx ? { ...l, expiry_date: e.target.value } : l
                          ))}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowReceiveModal(false)}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleReceive} disabled={acting}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--success,#65B179)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {acting ? '…' : '✓ Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
