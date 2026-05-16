'use client'
import { useState, useEffect } from 'react'

interface Product { id: string; name: string; price: number; sku: string | null; category?: string | null }
type Template = 'standard' | 'promo' | 'clearance'

const TEMPLATE_STYLES: Record<Template, { label: string; bg: string; accent: string; tag?: string }> = {
  standard: { label: 'Standard', bg: '#fff', accent: '#1a1a2e', tag: undefined },
  promo:    { label: 'Promotional', bg: '#FFF7ED', accent: '#EA580C', tag: 'SPECIAL OFFER' },
  clearance:{ label: 'Clearance', bg: '#FEF2F2', accent: '#DC2626', tag: 'CLEARANCE' },
}

export default function ShelfTicketsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [template, setTemplate] = useState<Template>('standard')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { setProducts(d.products ?? []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  const selectedProducts = products.filter(p => selected.has(p.id))
  const tmpl = TEMPLATE_STYLES[template]

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(p => p.id)))
  }

  function print() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Shelf Tickets</title><style>
      body{margin:0;font-family:Arial,sans-serif}
      @media print{@page{margin:10mm}}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px}
      .ticket{border:2px solid ${tmpl.accent};border-radius:6px;padding:12px;background:${tmpl.bg};page-break-inside:avoid}
      .tag{background:${tmpl.accent};color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;margin-bottom:6px;display:inline-block}
      .name{font-size:14px;font-weight:700;color:#111;margin-bottom:6px;line-height:1.2}
      .price{font-size:28px;font-weight:800;color:${tmpl.accent}}
      .sku{font-size:9px;color:#999;margin-top:4px}
    </style></head><body><div class="grid">`)
    selectedProducts.forEach(p => {
      w.document.write(`<div class="ticket">${tmpl.tag ? `<div class="tag">${tmpl.tag}</div>` : ''}<div class="name">${p.name}</div><div class="price">A$${p.price.toFixed(2)}</div>${p.sku ? `<div class="sku">SKU: ${p.sku}</div>` : ''}</div>`)
    })
    w.document.write(`</div></body></html>`)
    w.document.close(); w.print()
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Shelf Tickets</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Select products, choose a template, then print.</p>
        </div>
        <button onClick={print} disabled={selected.size === 0} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: selected.size === 0 ? 0.4 : 1 }}>
          🖨️ Print {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>

      {/* Template picker */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(Object.keys(TEMPLATE_STYLES) as Template[]).map(t => (
          <button key={t} onClick={() => setTemplate(t)}
            style={{ padding: '7px 16px', borderRadius: 8, border: `2px solid ${template === t ? 'var(--violet)' : 'var(--divider)'}`, background: template === t ? 'var(--violet-dim)' : 'transparent', color: template === t ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {TEMPLATE_STYLES[t].label}
          </button>
        ))}
      </div>

      {/* Search + select all */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
          style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={toggleAll} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading products…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 10 }}>
          {filtered.map(p => {
            const isSelected = selected.has(p.id)
            return (
              <div key={p.id} onClick={() => setSelected(prev => { const s = new Set(prev); isSelected ? s.delete(p.id) : s.add(p.id); return s })}
                style={{ padding: '12px 14px', borderRadius: 10, border: `2px solid ${isSelected ? 'var(--violet)' : 'var(--divider)'}`, background: isSelected ? 'var(--violet-dim)' : 'var(--bg-surface)', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>A${p.price.toFixed(2)}</div>
                {p.sku && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>SKU: {p.sku}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
