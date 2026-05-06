'use client';
import { useState, useEffect } from 'react';

const C = { bg: 'rgba(17,15,26,0.95)', card: 'rgba(26,23,40,0.9)', border: '#2A2540', text: '#EDE8FF', muted: '#8B85A8', dim: '#4A4565', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const iStyle: React.CSSProperties = { background: '#0A0910', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit' };

interface Product { id: string; name: string; sku: string | null; stock_quantity: number | null; track_stock: boolean; pos_categories?: { name: string; color: string } | null; }

export default function StocktakePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      const tracked = (d.products ?? []).filter((p: Product) => p.track_stock);
      setProducts(tracked);
      const init: Record<string, string> = {};
      tracked.forEach((p: Product) => { init[p.id] = p.stock_quantity != null ? String(p.stock_quantity) : '0'; });
      setCounts(init);
      setLoading(false);
    });
  }, []);

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase()));

  async function save() {
    setSaving(true);
    const updates = products
      .filter(p => counts[p.id] !== '' && counts[p.id] !== undefined)
      .map(p => fetch(`/api/pos/products?id=${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_quantity: parseInt(counts[p.id]) || 0 }),
      }));
    await Promise.all(updates);
    setProducts(ps => ps.map(p => ({ ...p, stock_quantity: parseInt(counts[p.id]) || 0 })));
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const changed = products.filter(p => counts[p.id] !== undefined && String(p.stock_quantity ?? 0) !== counts[p.id]);

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Stocktake</h1>
          <p style={{ fontSize: 12, color: C.muted }}>{products.length} tracked products · {changed.length} changes</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Saved!</span>}
          <button onClick={save} disabled={saving || changed.length === 0}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || changed.length === 0 ? 0.4 : 1 }}>
            {saving ? 'Saving…' : `Save${changed.length > 0 ? ` (${changed.length})` : ' Changes'}`}
          </button>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
        style={{ ...iStyle, maxWidth: 280, marginBottom: 14 }} />

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
              {['Product', 'SKU', 'Category', 'System Qty', 'Physical Count', 'Variance'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: C.dim, fontSize: 13 }}>Loading…</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: C.dim, fontSize: 13 }}>No tracked products</td></tr>
            ) : filtered.map((p, i) => {
              const system = p.stock_quantity ?? 0;
              const physical = parseInt(counts[p.id] || '0') || 0;
              const variance = physical - system;
              const isDirty = String(system) !== counts[p.id];
              return (
                <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', background: isDirty ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted, fontFamily: "'JetBrains Mono',monospace" }}>{p.sku || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {p.pos_categories
                      ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700, background: `${p.pos_categories.color}20`, color: p.pos_categories.color }}>{p.pos_categories.name}</span>
                      : <span style={{ fontSize: 11, color: C.dim }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.muted }}>{system}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <input value={counts[p.id] ?? ''} onChange={e => setCounts(c => ({ ...c, [p.id]: e.target.value }))}
                      type="number" min="0"
                      style={{ ...iStyle, width: 80, textAlign: 'center', padding: '6px 10px', borderColor: isDirty ? C.amber : C.border, background: isDirty ? 'rgba(245,158,11,0.06)' : '#0A0910' }} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {isDirty && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: variance > 0 ? C.violet : variance < 0 ? C.red : C.muted }}>
                        {variance > 0 ? '+' : ''}{variance}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
