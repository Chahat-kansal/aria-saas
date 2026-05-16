'use client'
import { useState, useEffect } from 'react'

interface Change { id: string; effective_date: string; new_price: number; applied: boolean; pos_products: { name: string; price: number } | null }
interface Product { id: string; name: string; price: number }
const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

export default function FuturePricesPage() {
  const [changes, setChanges] = useState<Change[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ product_id: '', new_price: '', effective_date: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const [c, p] = await Promise.all([
      fetch('/api/pos/scheduled-price-changes').then(r => r.json()).catch(() => ({ changes: [] })),
      fetch('/api/pos/products').then(r => r.json()).catch(() => ({ products: [] })),
    ])
    setChanges(c.changes ?? []); setProducts(p.products ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.product_id || !form.new_price || !form.effective_date) return
    setSaving(true)
    await fetch('/api/pos/scheduled-price-changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: form.product_id, new_price: parseFloat(form.new_price), effective_date: form.effective_date }) })
    setForm({ product_id: '', new_price: '', effective_date: '' }); load(); setSaving(false)
  }

  async function del(id: string) {
    await fetch('/api/pos/scheduled-price-changes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Future Prices</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Schedule price changes to take effect on a future date. Aria applies them automatically overnight.</p>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>Schedule Price Change</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Product *</label>
            <select style={{ ...inp, background: 'var(--bg-base)' }} value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
              <option value="">Select product…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} (A${p.price.toFixed(2)})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>New Price (A$) *</label>
            <input style={inp} type="number" step="0.01" min="0" value={form.new_price} onChange={e => setForm(f => ({ ...f, new_price: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Effective Date *</label>
            <input style={inp} type="date" min={today} value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
          </div>
        </div>
        <button onClick={add} disabled={saving || !form.product_id || !form.new_price || !form.effective_date}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Scheduling…' : 'Schedule Change'}
        </button>
      </div>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      : changes.length === 0 ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>No scheduled price changes yet.</div>
      : (
        <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-surface)' }}>
              {['Product', 'Current', 'New Price', 'Effective', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--divider)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.pos_products?.name ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>A${(c.pos_products?.price ?? 0).toFixed(2)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: c.new_price > (c.pos_products?.price ?? 0) ? '#ef4444' : '#22c55e' }}>A${c.new_price.toFixed(2)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{new Date(c.effective_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td style={{ padding: '10px 14px' }}><button onClick={() => del(c.id)} style={{ background: 'none', border: 'none', color: 'var(--destructive)', cursor: 'pointer', fontSize: 13 }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
