'use client';
import { useState, useEffect } from 'react';

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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Stocktake</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{products.length} tracked products · {changed.length} changes</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600 font-medium">Saved!</span>}
          <button onClick={save} disabled={saving || changed.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
            {saving ? 'Saving…' : `Save ${changed.length > 0 ? `(${changed.length})` : 'Changes'}`}
          </button>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
        className="mb-4 bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-xs text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb] w-64" />

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
              {['Product', 'SKU', 'Category', 'System Qty', 'Physical Count', 'Variance'].map(h => (
                <th key={h} className="text-left text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-xs text-[rgba(26,26,22,.3)]">Loading…</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} className="text-center py-16 text-xs text-[rgba(26,26,22,.3)]">No tracked products</td></tr>
            ) : filtered.map(p => {
              const system = p.stock_quantity ?? 0;
              const physical = parseInt(counts[p.id] || '0') || 0;
              const variance = physical - system;
              const isDirty = String(system) !== counts[p.id];
              return (
                <tr key={p.id} className={`border-b border-[rgba(0,0,0,.04)] last:border-0 transition-colors ${isDirty ? 'bg-amber-50' : 'hover:bg-[rgba(0,0,0,.01)]'}`}>
                  <td className="px-4 py-3 text-[13px] font-medium text-[#1a1a16]">{p.name}</td>
                  <td className="px-4 py-3 text-[11px] text-[rgba(26,26,22,.45)] font-mono">{p.sku || '—'}</td>
                  <td className="px-4 py-3">
                    {p.pos_categories
                      ? <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${p.pos_categories.color}20`, color: p.pos_categories.color }}>{p.pos_categories.name}</span>
                      : <span className="text-[10px] text-[rgba(26,26,22,.25)]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-[rgba(26,26,22,.7)]">{system}</td>
                  <td className="px-4 py-3">
                    <input value={counts[p.id] ?? ''} onChange={e => setCounts(c => ({ ...c, [p.id]: e.target.value }))}
                      type="number" min="0"
                      className={`w-20 border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none ${isDirty ? 'bg-amber-50 border-amber-300 focus:border-amber-500' : 'bg-[#fafaf8] border-[rgba(0,0,0,.1)] focus:border-[#2563eb]'}`} />
                  </td>
                  <td className="px-4 py-3">
                    {isDirty && (
                      <span className={`text-xs font-semibold ${variance > 0 ? 'text-emerald-600' : variance < 0 ? 'text-red-500' : 'text-[rgba(26,26,22,.4)]'}`}>
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