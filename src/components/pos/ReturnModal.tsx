'use client'
import { useState } from 'react'

const REASON_LABELS: Record<string, string> = {
  changed_mind: 'Changed mind',
  faulty_defective: 'Faulty / defective',
  wrong_item: 'Wrong item sent',
  damaged_in_transit: 'Damaged in transit',
  not_as_described: 'Not as described',
  expired: 'Expired / out of date',
  duplicate_purchase: 'Duplicate purchase',
  other: 'Other',
}

const REFUND_METHOD_LABELS: Record<string, string> = {
  original_payment: 'Original payment method',
  store_credit: 'Store credit (issue code)',
  cash: 'Cash',
  card: 'Card',
  exchange: 'Exchange for other items',
}

const CONDITION_OPTIONS: Array<{ value: string; label: string; restock: boolean; color: string }> = [
  { value: 'new',        label: 'New / unopened',  restock: true,  color: '#22c55e' },
  { value: 'good',       label: 'Good condition',  restock: true,  color: '#6b9fd4' },
  { value: 'damaged',    label: 'Damaged',         restock: false, color: '#f59e0b' },
  { value: 'quarantine', label: 'Quarantine',      restock: false, color: '#f97316' },
  { value: 'dispose',    label: 'Dispose',         restock: false, color: '#ef4444' },
]

interface SaleItemForReturn {
  id: string
  product_id: string | null
  product_name: string
  quantity: number
  returned_quantity: number
  unit_price: number
}

interface Props {
  saleId: string
  saleItems: SaleItemForReturn[]
  paymentMethod: string
  customerId: string | null
  onClose: () => void
  onSuccess: (result: { return_number: string; total_refund: number; store_credit_code?: string | null }) => void
}

interface LineState {
  selected: boolean
  qty: number
  condition: string
}

export default function ReturnModal({ saleId, saleItems, paymentMethod: _paymentMethod, customerId, onClose, onSuccess }: Props) {
  const returnable = saleItems.filter(i => ((Number(i.quantity) || 0) - (Number(i.returned_quantity) || 0)) > 0)
  const [lines, setLines] = useState<Record<string, LineState>>(
    Object.fromEntries(returnable.map(i => [i.id, {
      selected: false,
      qty: Math.max(1, (Number(i.quantity) || 0) - (Number(i.returned_quantity) || 0)),
      condition: 'new',
    }]))
  )
  const [reasonCode, setReasonCode] = useState('changed_mind')
  const [reasonNote, setReasonNote] = useState('')
  const [refundMethod, setRefundMethod] = useState('original_payment')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedLines = returnable.filter(i => lines[i.id]?.selected)
  const totalRefund = selectedLines.reduce((s, i) => s + (Number(i.unit_price) || 0) * (lines[i.id]?.qty || 0), 0)

  async function submit() {
    if (selectedLines.length === 0) { setError('Select at least one item to return'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/pos/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_sale_id: saleId,
          reason_code: reasonCode,
          reason_note: reasonNote || null,
          refund_method: refundMethod,
          customer_id: customerId,
          lines: selectedLines.map(i => {
            const cond = CONDITION_OPTIONS.find(c => c.value === lines[i.id].condition)
            return {
              original_item_id: i.id,
              product_id: i.product_id,
              product_name: i.product_name,
              quantity: lines[i.id].qty,
              unit_price: Number(i.unit_price) || 0,
              condition: lines[i.id].condition,
              restock: cond?.restock ?? false,
            }
          }),
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Return failed'); setSaving(false); return }
      onSuccess({ return_number: d.return_number, total_refund: Number(d.total_refund) || 0, store_credit_code: d.store_credit_code ?? null })
    } catch { setError('Connection error'); setSaving(false) }
  }

  const S: React.CSSProperties = { background:'#0d1a10', border:'1px solid rgba(127,184,151,0.2)', borderRadius:10, padding:'9px 12px', color:'#fff', fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#0a1a0d', border:'1px solid rgba(127,184,151,0.25)', borderRadius:20, padding:28, width:'100%', maxWidth:560, maxHeight:'90vh', overflow:'auto', boxShadow:'0 24px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:700, color:'#fff', margin:0 }}>Process Return</h2>
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', margin:'4px 0 0' }}>Select items, condition, and refund method</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.4)', fontSize:20, cursor:'pointer', padding:4 }}>×</button>
        </div>

        <div style={{ marginBottom:20 }}>
          <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Items</p>
          {returnable.length === 0 && <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)' }}>All items from this sale have been returned.</p>}
          {returnable.map(item => {
            const line = lines[item.id]
            const max = (Number(item.quantity) || 0) - (Number(item.returned_quantity) || 0)
            const cond = CONDITION_OPTIONS.find(c => c.value === line.condition)
            return (
              <div key={item.id} style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'10px 14px', marginBottom:8, border:`1px solid ${line.selected ? 'rgba(127,184,151,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: line.selected ? 10 : 0 }}>
                  <input type="checkbox" checked={line.selected} onChange={e => setLines(l => ({ ...l, [item.id]: { ...l[item.id], selected: e.target.checked } }))}
                    style={{ width:16, height:16, accentColor:'#7FB897', flexShrink:0, cursor:'pointer' }} />
                  <span style={{ flex:1, fontSize:13, color:'#fff', fontWeight:600 }}>{item.product_name}</span>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>A${(Number(item.unit_price)||0).toFixed(2)} × {max} available</span>
                </div>
                {line.selected && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, paddingLeft:26 }}>
                    <div>
                      <label style={{ fontSize:10, color:'rgba(255,255,255,0.4)', display:'block', marginBottom:4 }}>QTY TO RETURN</label>
                      <input type="number" min={1} max={max} value={line.qty}
                        onChange={e => setLines(l => ({ ...l, [item.id]: { ...l[item.id], qty: Math.min(max, Math.max(1, parseInt(e.target.value)||1)) } }))}
                        style={{ ...S, width:80 }} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:'rgba(255,255,255,0.4)', display:'block', marginBottom:4 }}>CONDITION</label>
                      <select value={line.condition} onChange={e => setLines(l => ({ ...l, [item.id]: { ...l[item.id], condition: e.target.value } }))} style={S}>
                        {CONDITION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn:'1/-1', fontSize:11, color: cond?.restock ? '#22c55e' : '#f59e0b' }}>
                      {cond?.restock ? '↩ Will be restocked' : '⚠ Will NOT be restocked'}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Reason</label>
          <select value={reasonCode} onChange={e => setReasonCode(e.target.value)} style={S}>
            {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={reasonNote} onChange={e => setReasonNote(e.target.value)} placeholder="Additional notes (optional)" style={{ ...S, marginTop:8 }} />
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Refund method</label>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {Object.entries(REFUND_METHOD_LABELS).map(([k, v]) => (
              <label key={k} onClick={() => setRefundMethod(k)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8, cursor:'pointer',
                background: refundMethod===k ? 'rgba(127,184,151,0.1)' : 'rgba(255,255,255,0.03)',
                border:`1px solid ${refundMethod===k ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.06)'}` }}>
                <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${refundMethod===k ? '#7FB897' : 'rgba(255,255,255,0.3)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {refundMethod===k && <div style={{ width:8, height:8, borderRadius:'50%', background:'#7FB897' }} />}
                </div>
                <span style={{ fontSize:13, color: refundMethod===k ? '#fff' : 'rgba(255,255,255,0.6)' }}>{v}</span>
              </label>
            ))}
          </div>
        </div>

        {selectedLines.length > 0 && (
          <div style={{ background:'rgba(127,184,151,0.08)', border:'1px solid rgba(127,184,151,0.2)', borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700, color:'#7FB897' }}>
              <span>Total refund</span>
              <span>A${totalRefund.toFixed(2)}</span>
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>
              {selectedLines.length} item(s) · {REFUND_METHOD_LABELS[refundMethod]}
            </div>
          </div>
        )}

        {error && <p style={{ color:'#ef4444', fontSize:12, marginBottom:12 }}>{error}</p>}

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={submit} disabled={saving || selectedLines.length === 0}
            style={{ flex:1, padding:'12px 0', borderRadius:10, border:'none', background:'#7FB897', color:'#080e14', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit', opacity: saving||selectedLines.length===0 ? 0.5 : 1 }}>
            {saving ? 'Processing…' : `Process Return${totalRefund > 0 ? ` · A$${totalRefund.toFixed(2)}` : ''}`}
          </button>
          <button onClick={onClose} style={{ padding:'12px 18px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(255,255,255,0.4)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}