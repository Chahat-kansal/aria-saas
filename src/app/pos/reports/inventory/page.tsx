'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Product { id: string; name: string; sku: string | null; stock_quantity: number | null; low_stock_threshold: number | null; cost_price: number | null; track_stock: boolean; pos_categories?: { name: string } | null; }

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#8B5CF6' };

export default function InventoryReportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [cat, setCat]           = useState('');

  useEffect(() => {
    fetch('/api/pos/products')
      .then(r => r.json())
      .then(d => { setProducts(d.products ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const tracked  = products.filter(p => p.track_stock);
  const cats     = [...new Set(products.map(p => (p.pos_categories as any)?.name).filter(Boolean))];
  const filtered = tracked.filter(p => {
    const nm = p.name.toLowerCase();
    const cn = ((p.pos_categories as any)?.name ?? '').toLowerCase();
    return (!search || nm.includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase()))
        && (!cat || cn === cat.toLowerCase());
  });

  const stockValue = filtered.reduce((s, p) => s + (p.stock_quantity ?? 0) * (p.cost_price ?? 0), 0);
  const lowStock   = filtered.filter(p => (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5));
  const outOfStock = filtered.filter(p => (p.stock_quantity ?? 0) <= 0);

  function exportCSV() {
    const rows = [['Name','SKU','Category','Stock','Reorder','Unit Cost','Value'].join(',')];
    filtered.forEach(p => rows.push([p.name, p.sku ?? '', (p.pos_categories as any)?.name ?? '', p.stock_quantity ?? 0, p.low_stock_threshold ?? 0, `$${(p.cost_price ?? 0).toFixed(2)}`, `$${((p.stock_quantity ?? 0) * (p.cost_price ?? 0)).toFixed(2)}`].join(',')));
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '24px 24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Inventory Report</h1>
            <p style={{ fontSize: 12, color: C.muted }}>Stock levels, valuation, and reorder alerts</p>
          </div>
          <button onClick={exportCSV} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Export CSV</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Tracked SKUs',  value: String(tracked.length) },
            { label: 'Stock Value',   value: `A$${stockValue.toFixed(2)}` },
            { label: 'Low Stock',     value: String(lowStock.length),  warn: lowStock.length > 0 },
            { label: 'Out of Stock',  value: String(outOfStock.length), warn: outOfStock.length > 0 },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, border: `1px solid ${(s as any).warn ? 'rgba(245,158,11,0.3)' : C.border}`, borderRadius: 16, padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.dim, marginBottom: 8 }}>{s.label}</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: (s as any).warn ? '#F59E0B' : C.text }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', flex: 1, fontFamily: 'inherit' }} />
          <select value={cat} onChange={e => setCat(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {lowStock.length > 0 && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#F59E0B', marginBottom: 8 }}>{lowStock.length} item{lowStock.length !== 1 ? 's' : ''} need reordering</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lowStock.slice(0,5).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: '6px 12px' }}>
                  <span style={{ fontSize: 13, color: C.text }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: '#F59E0B' }}>{p.stock_quantity} left (reorder at {p.low_stock_threshold})</span>
                </div>
              ))}
            </div>
            <Link href="/pos/orders" style={{ fontSize: 12, color: '#F59E0B', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>Create purchase order →</Link>
          </div>
        )}

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Product','SKU','Stock','Reorder','Unit Cost','Value','Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '12px 16px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: C.dim, fontSize: 13 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 64, color: C.dim, fontSize: 13 }}>
                  {tracked.length === 0 ? 'No tracked products. Enable stock tracking on products.' : 'No products match your filter.'}
                </td></tr>
              ) : filtered.map((p, i) => {
                const qty   = p.stock_quantity ?? 0;
                const isOut = qty <= 0;
                const isLow = !isOut && qty <= (p.low_stock_threshold ?? 5);
                return (
                  <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: C.text, fontSize: 13 }}>{p.name}</td>
                    <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: C.dim }}>{p.sku ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: isOut ? '#EF4444' : isLow ? '#F59E0B' : C.text }}>{qty}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: C.dim }}>{p.low_stock_threshold ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: C.muted }}>{p.cost_price ? `A$${p.cost_price.toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: C.muted }}>A${(qty * (p.cost_price ?? 0)).toFixed(2)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: isOut ? 'rgba(239,68,68,0.15)' : isLow ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', color: isOut ? '#EF4444' : isLow ? '#F59E0B' : '#22C55E' }}>
                        {isOut ? 'Out of stock' : isLow ? 'Low stock' : 'OK'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
