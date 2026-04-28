'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface StockItem {
  id: string; name: string; sku: string | null; stock: number; cost: number;
  value_cents: number; velocity_30d: number; velocity_rank: string;
  days_stock: number | null; reorder_point: number; needs_reorder: boolean;
  location: string | null; zone: string | null;
  lot_qty: number | null; earliest_expiry: string | null;
}

export default function StockPage() {
  const { business } = useBusinessContext();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'reorder' | 'high' | 'expiring'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'velocity' | 'stock' | 'value'>('velocity');

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/warehouse/stock?business_id=${business.id}`).then(r => r.json()).catch(() => ({ items: [] }));
    setItems(res.items ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const totalValue = items.reduce((s, i) => s + i.value_cents, 0);
  const reorderCount = items.filter(i => i.needs_reorder).length;
  const highVelCount = items.filter(i => i.velocity_rank === 'high').length;
  const expiringCount = items.filter(i => {
    if (!i.earliest_expiry) return false;
    const days = Math.ceil((new Date(i.earliest_expiry).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;

  const filtered = items
    .filter(i => {
      if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !(i.sku?.toLowerCase().includes(search.toLowerCase()))) return false;
      if (filter === 'reorder') return i.needs_reorder;
      if (filter === 'high') return i.velocity_rank === 'high';
      if (filter === 'expiring') {
        if (!i.earliest_expiry) return false;
        const days = Math.ceil((new Date(i.earliest_expiry).getTime() - Date.now()) / 86400000);
        return days >= 0 && days <= 30;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'velocity') return b.velocity_30d - a.velocity_30d;
      if (sortBy === 'stock') return b.stock - a.stock;
      if (sortBy === 'value') return b.value_cents - a.value_cents;
      return a.name.localeCompare(b.name);
    });

  function exportCSV() {
    const rows = [['Name', 'SKU', 'Stock', 'Velocity (30d)', 'Value', 'Location', 'Needs Reorder', 'Expiry'].join(',')];
    for (const i of filtered) {
      rows.push([i.name, i.sku ?? '', i.stock, i.velocity_30d, `A$${(i.value_cents / 100).toFixed(2)}`, i.location ?? '', i.needs_reorder ? 'Yes' : 'No', i.earliest_expiry ?? ''].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stock.csv'; a.click();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Stock Overview</h1>
          <p style={{ color: '#6b7280' }}>Master inventory with velocity, lot tracking, and bin locations.</p>
        </div>
        <button onClick={exportCSV} className="shrink-0 px-3 py-2 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Export CSV</button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total stock value', value: `A$${(totalValue / 100).toFixed(0)}`, color: '#fff' },
          { label: 'SKUs tracked', value: items.length, color: '#fff' },
          { label: 'Needs reorder', value: reorderCount, color: reorderCount > 0 ? '#ef4444' : '#1D9E75' },
          { label: 'Expiring (30d)', value: expiringCount, color: expiringCount > 0 ? '#f59e0b' : '#1D9E75' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{c.label}</p>
            <p className="text-2xl font-semibold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product or SKU…"
          className="px-3 py-2 rounded-xl text-sm outline-none flex-1 min-w-40"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }} />
        <div className="flex gap-1">
          {([['all', 'All'], ['reorder', `Reorder (${reorderCount})`], ['high', `High vel. (${highVelCount})`], ['expiring', `Expiring (${expiringCount})`]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className="px-3 py-2 rounded-xl text-xs transition-colors"
              style={filter === val ? { background: '#1D9E75', color: '#fff' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
              {label}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="px-3 py-2 rounded-xl text-sm text-white outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <option value="velocity" style={{ background: '#1a1a2e' }}>Sort: Velocity</option>
          <option value="stock" style={{ background: '#1a1a2e' }}>Sort: Stock</option>
          <option value="value" style={{ background: '#1a1a2e' }}>Sort: Value</option>
          <option value="name" style={{ background: '#1a1a2e' }}>Sort: Name</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Product', 'SKU', 'Stock', 'Velocity', 'Days Cover', 'Value', 'Location', 'Expiry', 'Status'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d0d14' }}>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No items found.</td></tr>
            ) : filtered.map(item => {
              const expiryDays = item.earliest_expiry ? Math.ceil((new Date(item.earliest_expiry).getTime() - Date.now()) / 86400000) : null;
              const isExpiring = expiryDays !== null && expiryDays >= 0 && expiryDays <= 30;
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: item.needs_reorder ? 'rgba(239,68,68,0.03)' : 'transparent' }}>
                  <td className="px-3 py-3 text-white font-medium">{item.name}</td>
                  <td className="px-3 py-3 font-mono text-xs" style={{ color: '#6b7280' }}>{item.sku ?? '—'}</td>
                  <td className="px-3 py-3 text-white font-medium">{item.stock}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.velocity_rank === 'high' ? 'bg-green-900/30 text-green-400' : item.velocity_rank === 'medium' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-gray-800 text-gray-400'}`}>
                      {item.velocity_30d}/30d
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {item.days_stock !== null ? (
                      <span style={{ color: item.days_stock < 7 ? '#ef4444' : item.days_stock < 14 ? '#f59e0b' : '#1D9E75' }}>{item.days_stock}d</span>
                    ) : <span style={{ color: '#4b5563' }}>—</span>}
                  </td>
                  <td className="px-3 py-3" style={{ color: '#9ca3af' }}>A${(item.value_cents / 100).toFixed(0)}</td>
                  <td className="px-3 py-3">
                    {item.location ? (
                      <span className="font-mono text-xs" style={{ color: '#9ca3af' }}>{item.location}</span>
                    ) : <span style={{ color: '#4b5563' }}>—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {expiryDays !== null ? (
                      <span style={{ color: expiryDays < 0 ? '#ef4444' : isExpiring ? '#f59e0b' : '#1D9E75' }} className="text-xs">{item.earliest_expiry}</span>
                    ) : <span style={{ color: '#4b5563' }}>—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {item.needs_reorder ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">Reorder</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>OK</span>
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
