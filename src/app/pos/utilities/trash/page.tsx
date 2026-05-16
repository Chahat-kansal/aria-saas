'use client'
import { useState, useEffect } from 'react'

interface Product { id: string; name: string; sku: string | null; price: number; category: string | null; updated_at: string | null }

export default function TrashedItemsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const d = await fetch('/api/pos/products?include_inactive=true').then(r => r.json()).catch(() => ({ products: [] }))
    setProducts((d.products ?? []).filter((p: any) => !p.is_active))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function restore(id: string) {
    setRestoring(id)
    await fetch(`/api/pos/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) })
    load(); setRestoring(null)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Trashed Items</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Products that have been deactivated. Restore them to make them available in the terminal again.</p>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
          <p style={{ margin: 0 }}>No deactivated products. All products are active.</p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-surface)' }}>
              {['Product', 'SKU', 'Price', 'Category', 'Deactivated', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--divider)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-tertiary)' }}>{p.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)' }}>{p.sku ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)' }}>A${p.price.toFixed(2)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)' }}>{p.category ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 12 }}>{p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => restore(p.id)} disabled={restoring === p.id}
                      style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: restoring === p.id ? 0.6 : 1 }}>
                      {restoring === p.id ? '…' : 'Restore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}