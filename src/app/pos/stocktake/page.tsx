'use client';
import { useState, useEffect } from 'react';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: '#D9D9D9', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#006AFF', green: '#00B140', red: '#EF4444', amber: '#F59E0B' };
const iStyle: React.CSSProperties = { background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit' };

interface Product { id: string; name: string; sku: string | null; stock_quantity: number | null; track_stock: boolean; pos_categories?: { name: string; color: string } | null; }

export default function StocktakePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');
  const [filterVariance, setFilterVariance] = useState<'all' | 'discrepancies'>('all');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

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

  const changed = products.filter(p => counts[p.id] !== undefined && String(p.stock_quantity ?? 0) !== counts[p.id]);
  const losses = changed.filter(p => parseInt(counts[p.id] || '0') < (p.stock_quantity ?? 0));
  const gains  = changed.filter(p => parseInt(counts[p.id] || '0') > (p.stock_quantity ?? 0));
  const totalLoss = losses.reduce((s, p) => s + ((p.stock_quantity ?? 0) - parseInt(counts[p.id] || '0')), 0);
  const totalGain  = gains.reduce((s, p) => s + (parseInt(counts[p.id] || '0') - (p.stock_quantity ?? 0)), 0);

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.sku ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterVariance === 'discrepancies' && String(p.stock_quantity ?? 0) === counts[p.id]) return false;
    return true;
  });

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

  async function getAiInsight() {
    if (changed.length === 0) return;
    setAiLoading(true);
    const discrepancies = changed.map(p => ({
      name: p.name,
      system: p.stock_quantity ?? 0,
      physical: parseInt(counts[p.id] || '0'),
      variance: parseInt(counts[p.id] || '0') - (p.stock_quantity ?? 0),
    }));
    try {
      const res = await fetch('/api/aria/stocktake-intelligence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discrepancies }),
      });
      const d = await res.json();
      setAiInsight(d.insight ?? null);
    } catch { /* non-critical */ }
    setAiLoading(false);
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Stocktake</h1>
          <p style={{ fontSize: 12, color: C.muted }}>{products.length} tracked products · {changed.length} changes</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Saved</span>}
          <button onClick={getAiInsight} disabled={aiLoading || changed.length === 0}
            style={{ padding: '8px 16px', borderRadius: 9, border: `1px solid rgba(127,184,151,0.4)`, background: 'rgba(127,184,151,0.1)', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: changed.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: changed.length === 0 ? 0.4 : 1 }}>
            {aiLoading ? 'Analysing…' : '✦ Aria insight'}
          </button>
          <button onClick={save} disabled={saving || changed.length === 0}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || changed.length === 0 ? 0.4 : 1 }}>
            {saving ? 'Saving…' : `Save${changed.length > 0 ? ` (${changed.length})` : ' Changes'}`}
          </button>
        </div>
      </div>

      {/* Variance summary cards */}
      {changed.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Discrepancies', value: changed.length, color: C.amber },
            { label: 'Total shrinkage', value: `-${totalLoss} units`, color: C.red },
            { label: 'Total surplus', value: `+${totalGain} units`, color: C.green },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI insight */}
      {aiInsight && (
        <div style={{ background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.25)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
          <span style={{ color: '#7FB897', fontWeight: 700, marginRight: 8 }}>✦ Aria</span>{aiInsight}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
          style={{ ...iStyle, maxWidth: 240 }} />
        <select value={filterVariance} onChange={e => setFilterVariance(e.target.value as 'all' | 'discrepancies')}
          style={{ ...iStyle, cursor: 'pointer' }}>
          <option value="all">All products</option>
          <option value="discrepancies">Discrepancies only</option>
        </select>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAFA', borderBottom: `1px solid ${C.border}` }}>
              {['Product', 'SKU', 'Category', 'System Qty', 'Physical Count', 'Variance'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: C.dim, fontSize: 13 }}>Loading…</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: C.dim, fontSize: 13 }}>
                {filterVariance === 'discrepancies' ? 'No discrepancies — stock counts match system.' : 'No tracked products'}
              </td></tr>
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
                      style={{ ...iStyle, width: 80, textAlign: 'center', padding: '6px 10px', borderColor: isDirty ? C.amber : C.border, background: isDirty ? 'rgba(245,158,11,0.06)' : 'var(--bg-base)' }} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {isDirty && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: variance > 0 ? C.green : variance < 0 ? C.red : C.muted }}>
                        {variance > 0 ? '+' : ''}{variance}
                        {variance < 0 && <span style={{ fontSize: 10, marginLeft: 4, color: C.red }}>▼ shrinkage</span>}
                        {variance > 0 && <span style={{ fontSize: 10, marginLeft: 4, color: C.green }}>▲ surplus</span>}
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
