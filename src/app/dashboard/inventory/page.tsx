'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Product { id: string; name: string; sku: string | null; stock_quantity: number | null; cost_price: number | null; price: number | null; low_stock_threshold: number | null; track_stock: boolean; pos_categories?: { name: string; color: string } | null }
interface Movement { id: string; product_id: string; product_name: string; movement_type: string; quantity_change: number; new_quantity: number; reason: string | null; created_at: string }
interface Insight { metrics: { sku_count: number; total_value: number; dead_value: number; dead_count: number; low_stock: number }; top_dead: Array<{ name: string; value_cents: number; stock: number }>; insight: string }

const C = { surface: 'rgba(255,255,255,0.03)', surface2: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', amber: '#f59e0b', red: '#ef4444', violet: '#A78BFA', text: '#E8EDE7', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'movements' | 'adjust' | 'valuation'>('overview')
  const [search, setSearch] = useState('')
  const [insight, setInsight] = useState<Insight | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ product_id: '', qty: 0, reason: 'counted' })
  const [adjustMsg, setAdjustMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/pos/products').then(r => r.json())
      setProducts((r.products ?? []).filter((p: Product) => p.track_stock))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (tab !== 'movements') return
    fetch('/api/pos/inventory?type=movements').then(r => r.json()).then(d => setMovements(d.movements ?? [])).catch(() => {})
  }, [tab])

  async function runInsight() {
    setInsightLoading(true)
    const r = await fetch('/api/aria/inventory-insight', { method: 'POST' }).then(r => r.json()).catch(() => null)
    setInsight(r); setInsightLoading(false)
  }

  async function submitAdjust() {
    if (!adjustForm.product_id || !adjustForm.qty) return
    setAdjustMsg('')
    const res = await fetch('/api/pos/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: adjustForm.product_id, quantity_change: Number(adjustForm.qty), reason: adjustForm.reason }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error) setAdjustMsg('Error: ' + res.error)
    else { setAdjustMsg('✓ Adjusted'); load(); setAdjustForm({ product_id: '', qty: 0, reason: 'counted' }) }
  }

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase()))
  const totalValue = products.reduce((a, p) => a + Number(p.stock_quantity ?? 0) * Number(p.cost_price ?? 0), 0)
  const lowStock = products.filter(p => p.low_stock_threshold != null && Number(p.stock_quantity ?? 0) <= Number(p.low_stock_threshold)).length

  // Valuation by category
  const byCategory: Record<string, { name: string; color: string; value: number; count: number }> = {}
  for (const p of products) {
    const cat = p.pos_categories?.name ?? 'Uncategorised'
    const color = p.pos_categories?.color ?? '#6b7280'
    if (!byCategory[cat]) byCategory[cat] = { name: cat, color, value: 0, count: 0 }
    byCategory[cat].value += Number(p.stock_quantity ?? 0) * Number(p.cost_price ?? 0)
    byCategory[cat].count++
  }
  const catList = Object.values(byCategory).sort((a, b) => b.value - a.value)

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: C.text, fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Inventory</h1>
          <p style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>Stock overview, movements, adjustments and valuation</p>
        </div>
        <Link href="/pos/stocktake" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.green, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>📋 Stocktake →</Link>
      </div>

      {/* Metrics strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'SKUs tracked', value: products.length, color: C.text },
          { label: 'Inventory value', value: 'A$' + totalValue.toLocaleString('en-AU', { maximumFractionDigits: 0 }), color: C.green },
          { label: 'Low stock', value: lowStock, color: lowStock > 0 ? C.amber : C.dim },
          { label: 'Dead stock', value: insight ? insight.metrics.dead_count : '—', color: insight && insight.metrics.dead_count > 0 ? C.red : C.dim },
        ].map(m => (
          <div key={m.label} style={{ padding: 14, borderRadius: 10, background: C.surface, border: '1px solid ' + C.border }}>
            <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: m.color, marginTop: 4 }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* AI insight card */}
      <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: insight?.insight ? 8 : 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.08em' }}>✦ Inventory insight</p>
          <button onClick={runInsight} disabled={insightLoading} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'rgba(167,139,250,0.2)', color: C.violet, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: insightLoading ? 0.5 : 1 }}>
            {insightLoading ? 'Analysing…' : insight ? 'Refresh' : 'Run analysis'}
          </button>
        </div>
        {insight?.insight && <p style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>{insight.insight}</p>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid ' + C.border }}>
        {(['overview', 'movements', 'adjust', 'valuation'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t ? 700 : 500, color: tab === t ? C.green : C.dim, borderBottom: tab === t ? '2px solid ' + C.green : '2px solid transparent', marginBottom: -1, textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {loading ? <p style={{ color: C.dim, textAlign: 'center', padding: 24 }}>Loading…</p>
        : tab === 'overview' ? (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or SKU…"
              style={{ width: '100%', maxWidth: 320, padding: '8px 12px', borderRadius: 8, background: C.surface, border: '1px solid ' + C.border, color: C.text, fontSize: 13, marginBottom: 12, fontFamily: 'inherit' }} />
            <div style={{ borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.surface }}>
                    {['Product', 'SKU', 'Stock', 'Threshold', 'Cost', 'Value'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map(p => {
                    const low = p.low_stock_threshold != null && Number(p.stock_quantity ?? 0) <= Number(p.low_stock_threshold)
                    const value = Number(p.stock_quantity ?? 0) * Number(p.cost_price ?? 0)
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid ' + C.border }}>
                        <td style={{ padding: '8px 14px', fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: '8px 14px', color: C.dim, fontFamily: 'monospace', fontSize: 11 }}>{p.sku ?? '—'}</td>
                        <td style={{ padding: '8px 14px', color: low ? C.red : C.text, fontWeight: low ? 700 : 400 }}>{p.stock_quantity ?? 0}{low && <span style={{ marginLeft: 6, fontSize: 9, padding: '2px 6px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: C.red, fontWeight: 700 }}>LOW</span>}</td>
                        <td style={{ padding: '8px 14px', color: C.dim }}>{p.low_stock_threshold ?? '—'}</td>
                        <td style={{ padding: '8px 14px', color: C.dim }}>A${Number(p.cost_price ?? 0).toFixed(2)}</td>
                        <td style={{ padding: '8px 14px', color: C.green, fontWeight: 600 }}>A${value.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : tab === 'movements' ? (
          movements.length === 0 ? <p style={{ color: C.dim, textAlign: 'center', padding: 24 }}>No movements recorded yet.</p> : (
            <div style={{ borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: C.surface }}>{['When', 'Product', 'Type', 'Change', 'New Qty', 'Reason'].map(h => (<th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>))}</tr></thead>
                <tbody>
                  {movements.slice(0, 100).map(m => (
                    <tr key={m.id} style={{ borderTop: '1px solid ' + C.border }}>
                      <td style={{ padding: '8px 14px', color: C.dim }}>{new Date(m.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ padding: '8px 14px', fontWeight: 600 }}>{m.product_name}</td>
                      <td style={{ padding: '8px 14px', color: C.dim }}>{m.movement_type}</td>
                      <td style={{ padding: '8px 14px', color: m.quantity_change > 0 ? C.green : C.red, fontWeight: 700 }}>{m.quantity_change > 0 ? '+' : ''}{m.quantity_change}</td>
                      <td style={{ padding: '8px 14px' }}>{m.new_quantity}</td>
                      <td style={{ padding: '8px 14px', color: C.dim }}>{m.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'adjust' ? (
          <div style={{ maxWidth: 480, padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Manual stock adjustment</p>
            <select value={adjustForm.product_id} onChange={e => setAdjustForm(f => ({ ...f, product_id: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: C.surface2, border: '1px solid ' + C.border, color: C.text, fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }}>
              <option value="">Select a product…</option>
              {products.map(p => <option key={p.id} value={p.id} style={{ background: '#1A2620' }}>{p.name} (stock: {p.stock_quantity ?? 0})</option>)}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input type="number" value={adjustForm.qty} onChange={e => setAdjustForm(f => ({ ...f, qty: Number(e.target.value) }))}
                placeholder="Change (+/-)" style={{ padding: '8px 12px', borderRadius: 8, background: C.surface2, border: '1px solid ' + C.border, color: C.text, fontSize: 13, fontFamily: 'inherit' }} />
              <select value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: 8, background: C.surface2, border: '1px solid ' + C.border, color: C.text, fontSize: 13, fontFamily: 'inherit' }}>
                <option value="counted" style={{ background: '#1A2620' }}>Counted</option>
                <option value="damaged" style={{ background: '#1A2620' }}>Damaged</option>
                <option value="found" style={{ background: '#1A2620' }}>Found</option>
                <option value="transferred" style={{ background: '#1A2620' }}>Transferred</option>
                <option value="received" style={{ background: '#1A2620' }}>Received</option>
              </select>
            </div>
            <button onClick={submitAdjust} disabled={!adjustForm.product_id || !adjustForm.qty}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: C.green, color: '#0E1812', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: adjustForm.product_id && adjustForm.qty ? 1 : 0.5 }}>
              Submit adjustment
            </button>
            {adjustMsg && <p style={{ marginTop: 8, fontSize: 12, color: adjustMsg.startsWith('✓') ? C.green : C.red }}>{adjustMsg}</p>}
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 18, padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
              <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Total inventory value</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: C.green }}>A${totalValue.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div style={{ borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: C.surface }}>{['Category', 'SKUs', 'Value'].map(h => (<th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>))}</tr></thead>
                <tbody>
                  {catList.map(c => (
                    <tr key={c.name} style={{ borderTop: '1px solid ' + C.border }}>
                      <td style={{ padding: '8px 14px' }}><span style={{ color: c.color, fontWeight: 600 }}>● {c.name}</span></td>
                      <td style={{ padding: '8px 14px', color: C.dim }}>{c.count}</td>
                      <td style={{ padding: '8px 14px', color: C.green, fontWeight: 600 }}>A${c.value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {insight?.top_dead && insight.top_dead.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <p style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Top dead stock (no sales 90d)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {insight.top_dead.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <span>{d.name}</span>
                      <span style={{ color: C.red, fontWeight: 600 }}>A${(d.value_cents / 100).toFixed(2)} · {d.stock} units</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  )
}
