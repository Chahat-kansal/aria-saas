'use client';
import { useState, useEffect } from 'react';

interface Product { id: string; name: string; price: number; barcode?: string | null; sku?: string | null; pos_categories?: { name: string } | null; }

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6' };

export default function EverydayTicketsPage() {
  const [products, setProducts]   = useState<Product[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [printing, setPrinting]   = useState(false);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      setProducts((d.products ?? []).filter((p: Product) => p.price > 0));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const cats = [...new Set(products.map(p => (p.pos_categories as any)?.name).filter(Boolean))];
  const [catFilter, setCatFilter] = useState('');

  const filtered = products.filter(p => {
    const nm = p.name.toLowerCase();
    return (!search || nm.includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase()))
        && (!catFilter || (p.pos_categories as any)?.name === catFilter);
  });

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  async function print() {
    const ids = Array.from(selected);
    if (!ids.length) { alert('Select at least one product'); return; }
    setPrinting(true);
    try {
      const r = await fetch('/api/pos/price-tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: ids, template: 'everyday' }),
      });
      const html = await r.text();
      const w = window.open('', '_blank', 'width=800,height=600');
      if (w) { w.document.write(html); w.document.close(); w.focus(); }
    } catch { alert('Failed to generate tickets'); }
    setPrinting(false);
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '24px 24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Everyday Price Tickets</h1>
            <p style={{ fontSize: 12, color: C.muted }}>{selected.size} of {filtered.length} selected</p>
          </div>
          <button onClick={print} disabled={printing || selected.size === 0}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: selected.size === 0 ? 0.4 : 1 }}>
            {printing ? 'Generating…' : `🖨️ Print ${selected.size > 0 ? `(${selected.size})` : ''} Tickets`}
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            style={{ flex: 1, minWidth: 200, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Product list */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll}
              style={{ width: 14, height: 14, accentColor: C.violet }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim }}>Select all ({filtered.length})</span>
          </div>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div>
          ) : !filtered.length ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 13 }}>No products found</div>
          ) : (
            filtered.map((p, i) => (
              <div key={p.id} onClick={() => setSelected(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', background: selected.has(p.id) ? 'rgba(139,92,246,0.06)' : 'transparent', transition: 'background 100ms' }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => {}} style={{ width: 14, height: 14, accentColor: C.violet, pointerEvents: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{(p.pos_categories as any)?.name ?? ''}{p.sku ? ` · ${p.sku}` : ''}</div>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 800, color: selected.has(p.id) ? C.violet : C.text }}>A${p.price.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
