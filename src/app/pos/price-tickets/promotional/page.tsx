'use client';
import { useState, useEffect } from 'react';

interface Product { id: string; name: string; price: number; barcode?: string | null; sku?: string | null; pos_categories?: { name: string } | null; }

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6' };

export default function PromotionalTicketsPage() {
  const [products, setProducts]     = useState<Product[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [printing, setPrinting]     = useState(false);
  const [promoPrice, setPromoPrice] = useState('');

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      setProducts((d.products ?? []).filter((p: Product) => p.price > 0));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  async function print() {
    const ids = Array.from(selected);
    if (!ids.length) { alert('Select at least one product'); return; }
    setPrinting(true);
    try {
      const r = await fetch('/api/pos/price-tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: ids, template: 'promotional', promotional_price: promoPrice }),
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
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Promotional Tickets</h1>
            <p style={{ fontSize: 12, color: C.muted }}>Tickets show original price crossed out + promo price in red</p>
          </div>
          <button onClick={print} disabled={printing || selected.size === 0}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#EF4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: selected.size === 0 ? 0.4 : 1 }}>
            {printing ? 'Generating…' : `🖨️ Print (${selected.size})`}
          </button>
        </div>

        {/* Promo price */}
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: C.text }}>Promotional price for all selected products:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#EF4444' }}>A$</span>
            <input type="number" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} min="0" step="0.01" placeholder="0.00"
              style={{ width: 100, background: C.card, border: `1px solid rgba(239,68,68,0.3)`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 16, fontWeight: 700, outline: 'none', fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
          style={{ width: '100%', marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div>
          ) : filtered.map((p, i) => (
            <div key={p.id} onClick={() => setSelected(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', background: selected.has(p.id) ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => {}} style={{ width: 14, height: 14, accentColor: '#EF4444', pointerEvents: 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.dim }}>RRP: <span style={{ textDecoration: 'line-through' }}>A${p.price.toFixed(2)}</span>{promoPrice ? ` → A$${parseFloat(promoPrice).toFixed(2)}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
