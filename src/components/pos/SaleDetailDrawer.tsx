'use client'
import { useState, useEffect, useCallback } from 'react'

interface SaleDetail {
  id: string
  sale_number: string
  status: string
  total_amount: number
  subtotal: number
  tax_amount: number
  discount_amount: number
  payment_method: string | null
  created_at: string
  served_by: string | null
  customer_name: string | null
  tax_breakdown: unknown
  last_edited_at: string | null
}
interface SaleItem { id: string; product_name: string; quantity: number; unit_price: number; line_total: number; modifiers?: unknown }
interface SaleEdit { id: string; action: string; field_changed: string; old_value: string; new_value: string; reason: string; edited_by: string; edited_at: string }
interface SalePayment { id: string; payment_method: string; amount: number }

interface Props {
  saleId: string
  onClose: () => void
  onVoided?: () => void
}

export default function SaleDetailDrawer({ saleId, onClose, onVoided }: Props) {
  const [data, setData] = useState<{ sale: SaleDetail; items: SaleItem[]; payments: SalePayment[]; edits: SaleEdit[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [voidReason, setVoidReason] = useState('')
  const [voidOpen, setVoidOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editField, setEditField] = useState('customer_name')
  const [editValue, setEditValue] = useState('')
  const [editReason, setEditReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [insight, setInsight] = useState<string>('')
  const [insightLoading, setInsightLoading] = useState(false)

  async function fetchInsight() {
    setInsightLoading(true)
    const r = await fetch('/api/aria/sale-insight', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_id: saleId }),
    }).then(r => r.json()).catch(() => null)
    setInsight(r?.insight ?? 'Could not generate insight.')
    setInsightLoading(false)
  }


  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/pos/sales-history/${saleId}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [saleId])
  useEffect(() => { load() }, [load])

  async function voidSale() {
    if (!voidReason.trim()) { alert('Reason required'); return }
    setVoiding(true)
    const r = await fetch(`/api/pos/sales-history/${saleId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: voidReason }),
    })
    setVoiding(false)
    if (r.ok) { setVoidOpen(false); onVoided?.(); onClose() }
    else { const d = await r.json(); alert(d.error ?? 'Void failed') }
  }

  async function saveEdit() {
    if (!editReason.trim()) { alert('Reason required'); return }
    setSaving(true)
    const r = await fetch(`/api/pos/sales-history/${saleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_changed: editField, new_value: editValue, reason: editReason }),
    })
    setSaving(false)
    if (r.ok) { setEditOpen(false); load() }
    else { const d = await r.json(); alert(d.error ?? 'Edit failed') }
  }

  const statusColor: Record<string, string> = { completed: '#7FB897', voided: '#FF6B6B', refunded: '#FFB347', parked: '#A8B5A8' }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full overflow-y-auto flex flex-col"
        style={{ background: 'var(--bg-elevated, #1A2620)', borderLeft: '1px solid var(--divider, rgba(232,237,231,0.06))', isolation: 'isolate', colorScheme: 'dark' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
          <div>
            <div className="font-semibold text-base" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
              {data?.sale.sale_number ?? '…'}
            </div>
            {data?.sale.status && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block" style={{ background: `${statusColor[data.sale.status] ?? '#A8B5A8'}22`, color: statusColor[data.sale.status] ?? '#A8B5A8' }}>
                {data.sale.status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>×</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
        ) : !data ? (
          <div className="p-8 text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Sale not found.</div>
        ) : (
          <div className="flex-1 p-5 space-y-5">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Date', new Date(data.sale.created_at).toLocaleString()],
                ['Served by', data.sale.served_by ?? '—'],
                ['Customer', data.sale.customer_name ?? '—'],
                ['Payment', data.sale.payment_method ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{k}</div>
                  <div className="font-medium" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Aria sale insight */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.25)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#7FB897' }}>✦ Aria insight</span>
                <button onClick={fetchInsight} disabled={insightLoading} className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(45,82,64,0.4)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.3)' }}>
                  {insightLoading ? 'Thinking…' : insight ? 'Re-run' : 'Get insight'}
                </button>
              </div>
              {insight ? (
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{insight}</p>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Click to ask Aria what is notable about this sale.</p>
              )}
            </div>

            {/* Items */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Items</h3>
              <div className="space-y-1">
                {data.items.map(it => (
                  <div key={it.id} className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-primary, #E8EDE7)' }}>{it.quantity}× {it.product_name}</span>
                    <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>${(Number(it.line_total) || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(127,184,151,0.05)', border: '1px solid rgba(127,184,151,0.1)' }}>
              {[
                ['Subtotal', `$${(Number(data.sale.subtotal) || 0).toFixed(2)}`],
                ['Tax', `$${(Number(data.sale.tax_amount) || 0).toFixed(2)}`],
                ['Discounts', `-$${(Number(data.sale.discount_amount) || 0).toFixed(2)}`],
                ['TOTAL', `$${(Number(data.sale.total_amount) || 0).toFixed(2)}`],
              ].map(([k, v]) => (
                <div key={k} className={`flex justify-between text-sm ${k === 'TOTAL' ? 'font-semibold pt-1 border-t' : ''}`} style={k === 'TOTAL' ? { borderColor: 'rgba(127,184,151,0.15)', color: 'var(--text-primary, #E8EDE7)' } : { color: 'var(--text-secondary, #A8B5A8)' }}>
                  <span>{k}</span><span>{v}</span>
                </div>
              ))}
            </div>

            {/* Edit history */}
            {data.edits.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Edit history</h3>
                <div className="space-y-2">
                  {data.edits.map(e => (
                    <div key={e.id} className="text-xs rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                      <span className="font-medium" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{e.action}</span>
                      {e.field_changed && <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}> — {e.field_changed}: {e.old_value} → {e.new_value}</span>}
                      <div style={{ color: 'var(--text-tertiary, #6E7C6E)' }}>{e.reason} · {new Date(e.edited_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {data.sale.status !== 'voided' && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditOpen(true)} className="flex-1 py-2 rounded-xl text-sm font-medium" style={{ border: '1px solid rgba(127,184,151,0.2)', color: '#7FB897' }}>
                  Edit notes
                </button>
                <a href={`/pos/returns?sale_id=${saleId}`} className="flex-1 py-2 rounded-xl text-sm font-medium text-center" style={{ border: '1px solid rgba(255,179,71,0.3)', color: '#FFB347' }}>
                  Refund
                </a>
                <button onClick={() => setVoidOpen(true)} className="flex-1 py-2 rounded-xl text-sm font-medium" style={{ border: '1px solid rgba(255,107,107,0.3)', color: '#FF6B6B' }}>
                  Void
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Void modal */}
      {voidOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setVoidOpen(false)}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid rgba(255,107,107,0.3)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Void sale</h2>
            <textarea rows={3} value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason for void (required)" className="w-full rounded-xl px-3 py-2 text-sm mb-3" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setVoidOpen(false)} className="px-4 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary, #A8B5A8)' }}>Cancel</button>
              <button onClick={voidSale} disabled={voiding} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B' }}>
                {voiding ? 'Voiding…' : 'Confirm void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditOpen(false)}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid rgba(127,184,151,0.2)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Edit sale</h2>
            <select value={editField} onChange={e => setEditField(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm mb-2" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}>
              <option value="customer_name">Customer name</option>
              <option value="notes">Notes</option>
            </select>
            <input value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="New value" className="w-full rounded-xl px-3 py-2 text-sm mb-2" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
            <input value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Reason for edit (required)" className="w-full rounded-xl px-3 py-2 text-sm mb-3" style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary, #A8B5A8)' }}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: '#2D5240', color: '#7FB897' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
