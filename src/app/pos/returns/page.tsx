'use client'
import { useState, useEffect, useCallback } from 'react'

interface ReturnRecord {
  id: string
  return_number: string
  original_sale_id: string
  reason_code: string
  reason_note: string | null
  refund_method: string
  total_refund: number | string
  status: string
  store_credit_id: string | null
  exchange_sale_id: string | null
  created_at: string
  pos_return_lines?: Array<{
    product_name: string
    quantity: number
    condition: string
    restock: boolean
    line_refund: number | string
  }>
}

const REASON_LABELS: Record<string, string> = {
  changed_mind: 'Changed mind', faulty_defective: 'Faulty/defective',
  wrong_item: 'Wrong item', damaged_in_transit: 'Damaged in transit',
  not_as_described: 'Not as described', expired: 'Expired',
  duplicate_purchase: 'Duplicate purchase', other: 'Other',
}
const METHOD_LABELS: Record<string, string> = {
  original_payment: 'Original method', store_credit: 'Store credit',
  cash: 'Cash', card: 'Card', exchange: 'Exchange',
}
const CONDITION_COLORS: Record<string, string> = {
  new: '#22c55e', good: '#6b9fd4', damaged: '#f59e0b', quarantine: '#f97316', dispose: '#ef4444'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ReturnsPage() {
  const [records, setRecords] = useState<ReturnRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterMethod, setFM] = useState('')
  const [filterReason, setFR] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const d = await fetch('/api/pos/returns').then(r => r.json()).catch(() => ({ returns: [] }))
    setRecords(Array.isArray(d.returns) ? d.returns : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = records.filter(r =>
    (!filterMethod || r.refund_method === filterMethod) &&
    (!filterReason || r.reason_code === filterReason)
  )
  const totalRefunded = filtered.reduce((s, r) => s + (Number(r.total_refund) || 0), 0)

  const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }

  return (
    <div style={{ padding: '24px 28px', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Returns & Exchanges</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
            {filtered.length} return{filtered.length !== 1 ? 's' : ''} · A${totalRefunded.toFixed(2)} total refunded
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filterMethod} onChange={e => setFM(e.target.value)} style={inp}>
            <option value="">All methods</option>
            {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterReason} onChange={e => setFR(e.target.value)} style={inp}>
            <option value="">All reasons</option>
            {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={() => { setFM(''); setFR('') }} style={{ ...inp, cursor: 'pointer', color: 'var(--text-tertiary)' }}>Clear</button>
          <button onClick={load} style={{ ...inp, background: 'var(--violet)', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No returns yet. Process a return from the Sale History page.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => (
            <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
              <div onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--violet)', background: 'rgba(139,92,246,0.1)', padding: '2px 8px', borderRadius: 6 }}>{r.return_number}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{REASON_LABELS[r.reason_code] ?? r.reason_code}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{METHOD_LABELS[r.refund_method] ?? r.refund_method}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#ef4444' }}>−A${(Number(r.total_refund) || 0).toFixed(2)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDate(r.created_at)}</span>
                {r.exchange_sale_id && <span style={{ fontSize: 10, fontWeight: 700, color: '#7FB897', background: 'rgba(127,184,151,0.1)', padding: '2px 6px', borderRadius: 4 }}>EXCHANGE</span>}
              </div>
              {expanded === r.id && (
                <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--divider)' }}>
                  {r.reason_note && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 8px' }}>&ldquo;{r.reason_note}&rdquo;</p>}
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Item', 'Qty', 'Condition', 'Restock', 'Refund'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(r.pos_return_lines ?? []).map((l, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--divider)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{l.product_name}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{l.quantity}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: CONDITION_COLORS[l.condition] ?? 'var(--text-tertiary)', background: `${CONDITION_COLORS[l.condition] ?? '#94a3b8'}15`, padding: '2px 6px', borderRadius: 4 }}>{l.condition}</span>
                          </td>
                          <td style={{ padding: '6px 8px', color: l.restock ? '#22c55e' : '#ef4444', fontSize: 11 }}>{l.restock ? '↩ Yes' : '✗ No'}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>A${(Number(l.line_refund) || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Original sale: {String(r.original_sale_id).slice(-6).toUpperCase()}
                    {r.exchange_sale_id && ` · Exchange sale: ${String(r.exchange_sale_id).slice(-6).toUpperCase()}`}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}