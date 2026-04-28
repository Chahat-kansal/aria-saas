'use client';
import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface StockItem {
  id: string; name: string; sku: string | null; stock: number; cost: number;
  value_cents: number; velocity_30d: number; velocity_rank: string;
  days_stock: number | null; reorder_point: number; needs_reorder: boolean;
  location: string | null; zone: string | null;
  lot_qty: number | null; earliest_expiry: string | null;
}

const ADJUST_REASONS = ['Stocktake correction', 'Damaged goods', 'Waste / spoilage', 'Return to supplier', 'Theft / shrinkage', 'Data correction', 'Other'];

function DaysDisplay({ days, stock }: { days: number | null; stock: number }) {
  if (stock === 0) return <span className="text-xs font-medium text-red-400">0 days</span>;
  if (days === null || days <= 0) return <span className="text-xs" style={{ color: '#4b5563' }}>∞</span>;
  if (days > 365) return <span className="text-xs" style={{ color: '#9ca3af' }}>365+ days</span>;
  const color = days < 7 ? '#ef4444' : days < 14 ? '#f59e0b' : '#1D9E75';
  return <span className="text-xs font-medium" style={{ color }}>{days}d</span>;
}

export default function StockPage() {
  const { business } = useBusinessContext();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [filter, setFilter] = useState<'all' | 'reorder' | 'high' | 'expiring' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'velocity' | 'stock' | 'value' | 'days'>('velocity');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState(ADJUST_REASONS[0]);
  const [adjusting, setAdjusting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/warehouse/stock?business_id=${business.id}`).then(r => r.json()).catch(() => ({ items: [] }));
    setItems(res.items ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  async function applyAdjust(item: StockItem) {
    if (!business?.id || !adjustQty) return;
    setAdjusting(true);
    const newQty = parseInt(adjustQty);
    if (isNaN(newQty) || newQty < 0) { setAdjusting(false); return; }
    await fetch('/api/warehouse/stock/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, item_id: item.id, new_quantity: newQty, reason: adjustReason }),
    });
    setAdjusting(false);
    setAdjustingId(null);
    setAdjustQty('');
    load();
  }

  function exportCSV() {
    const rows = [['Name', 'SKU', 'Stock', 'Velocity (30d)', 'Days of Stock', 'Unit Cost', 'Stock Value', 'Location', 'Expiry', 'Status'].join(',')];
    for (const i of filtered) {
      const days = i.days_stock !== null && i.stock > 0 ? (i.days_stock > 365 ? '365+' : String(i.days_stock)) : i.stock === 0 ? '0' : '∞';
      rows.push([i.name, i.sku ?? '', i.stock, i.velocity_30d, days, `A$${i.cost.toFixed(2)}`, `A$${(i.value_cents / 100).toFixed(2)}`, i.location ?? '', i.earliest_expiry ?? '', i.needs_reorder ? 'Reorder' : 'OK'].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `stock-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const outOfStock = items.filter(i => i.stock === 0).length;
  const totalValue = items.reduce((s, i) => s + i.value_cents, 0);
  const reorderCount = items.filter(i => i.needs_reorder).length;
  const highVelCount = items.filter(i => i.velocity_rank === 'high').length;
  const expiringCount = items.filter(i => {
    if (!i.earliest_expiry) return false;
    const d = Math.ceil((new Date(i.earliest_expiry).getTime() - Date.now()) / 86400000);
    return d >= 0 && d <= 30;
  }).length;

  const filtered = items
    .filter(i => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (!i.name.toLowerCase().includes(q) && !(i.sku?.toLowerCase().includes(q))) return false;
      }
      if (filter === 'reorder') return i.needs_reorder;
      if (filter === 'high') return i.velocity_rank === 'high';
      if (filter === 'out') return i.stock === 0;
      if (filter === 'expiring') {
        if (!i.earliest_expiry) return false;
        const d = Math.ceil((new Date(i.earliest_expiry).getTime() - Date.now()) / 86400000);
        return d >= 0 && d <= 30;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'velocity') return b.velocity_30d - a.velocity_30d;
      if (sortBy === 'stock') return b.stock - a.stock;
      if (sortBy === 'value') return b.value_cents - a.value_cents;
      if (sortBy === 'days') return (a.days_stock ?? 9999) - (b.days_stock ?? 9999);
      return a.name.localeCompare(b.name);
    });

  if (loading && items.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl" />)}
        </div>
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Stock Overview</h1>
          <p style={{ color: '#6b7280' }}>Master inventory with velocity, lot tracking, and bin locations.</p>
        </div>
        <button onClick={exportCSV} className="shrink-0 px-3 py-2 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
          Export CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Stock value', value: `A$${(totalValue / 100).toFixed(0)}`, color: '#fff' },
          { label: 'SKUs', value: items.length, color: '#fff' },
          { label: 'Out of stock', value: outOfStock, color: outOfStock > 0 ? '#ef4444' : '#1D9E75' },
          { label: 'Reorder needed', value: reorderCount, color: reorderCount > 0 ? '#f59e0b' : '#1D9E75' },
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
        <div className="flex gap-1 flex-wrap">
          {([
            ['all', 'All'],
            ['out', `Out (${outOfStock})`],
            ['reorder', `Reorder (${reorderCount})`],
            ['high', `Fast (${highVelCount})`],
            ['expiring', `Expiring (${expiringCount})`],
          ] as const).map(([val, label]) => (
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
          <option value="days" style={{ background: '#1a1a2e' }}>Sort: Days left</option>
          <option value="stock" style={{ background: '#1a1a2e' }}>Sort: Stock</option>
          <option value="value" style={{ background: '#1a1a2e' }}>Sort: Value</option>
          <option value="name" style={{ background: '#1a1a2e' }}>Sort: Name</option>
        </select>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="mb-3 px-4 py-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.2)' }}>
          <span className="text-sm" style={{ color: '#1D9E75' }}>{selected.size} selected</span>
          <button onClick={() => { exportCSV(); setSelected(new Set()); }} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: '#1D9E75' }}>
            Export selected
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs" style={{ color: '#6b7280' }}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th className="px-3 py-3 w-8">
                <input type="checkbox" className="w-4 h-4 accent-[#1D9E75]"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={e => setSelected(e.target.checked ? new Set(filtered.map(i => i.id)) : new Set())} />
              </th>
              {['Product', 'On Hand', 'Days', 'Velocity', 'Value', 'Location', 'Expiry', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d0d14' }}>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No items found.</td></tr>
            ) : filtered.map(item => {
              const expiryDays = item.earliest_expiry ? Math.ceil((new Date(item.earliest_expiry).getTime() - Date.now()) / 86400000) : null;
              const isExpanded = expanded === item.id;
              const isAdjusting = adjustingId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: item.stock === 0 ? 'rgba(239,68,68,0.04)' : item.needs_reorder ? 'rgba(245,158,11,0.03)' : 'transparent' }}>
                    <td className="px-3 py-3">
                      <input type="checkbox" className="w-4 h-4 accent-[#1D9E75]"
                        checked={selected.has(item.id)}
                        onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(item.id) : n.delete(item.id); return n; })} />
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => setExpanded(isExpanded ? null : item.id)} className="text-left hover:text-[#1D9E75] transition-colors">
                        <p className="font-medium text-white text-sm">{item.name}</p>
                        {item.sku && <p className="text-xs font-mono" style={{ color: '#6b7280' }}>{item.sku}</p>}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-white font-medium">{item.stock}</td>
                    <td className="px-3 py-3"><DaysDisplay days={item.days_stock} stock={item.stock} /></td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${item.velocity_rank === 'high' ? 'bg-green-900/30 text-green-400' : item.velocity_rank === 'medium' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-gray-800 text-gray-400'}`}>
                        {item.velocity_30d}/30d
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs" style={{ color: '#9ca3af' }}>A${(item.value_cents / 100).toFixed(0)}</td>
                    <td className="px-3 py-3">
                      {item.location ? <span className="font-mono text-xs" style={{ color: '#9ca3af' }}>{item.location}</span> : <span style={{ color: '#4b5563' }}>—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {expiryDays !== null ? (
                        <span className="text-xs" style={{ color: expiryDays < 0 ? '#ef4444' : expiryDays <= 30 ? '#f59e0b' : '#1D9E75' }}>
                          {item.earliest_expiry}
                        </span>
                      ) : <span style={{ color: '#4b5563' }}>—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {item.stock === 0 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">Out of stock</span>
                      ) : item.needs_reorder ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-400">Reorder now</span>
                      ) : expiryDays !== null && expiryDays <= 30 && expiryDays >= 0 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-400">Lots expiring</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>In stock</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => { setAdjustingId(isAdjusting ? null : item.id); setAdjustQty(String(item.stock)); }}
                        className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                        Adjust
                      </button>
                    </td>
                  </tr>

                  {/* Inline adjust row */}
                  {isAdjusting && (
                    <tr style={{ background: 'rgba(29,158,117,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td colSpan={10} className="px-5 py-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="text-xs text-white">Adjust <strong>{item.name}</strong></p>
                          <input type="number" min={0} value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                            className="w-24 px-2 py-1 rounded-lg text-sm text-white outline-none"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
                          <select value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                            className="px-2 py-1 rounded-lg text-xs text-white outline-none"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {ADJUST_REASONS.map(r => <option key={r} value={r} style={{ background: '#1a1a2e' }}>{r}</option>)}
                          </select>
                          <button onClick={() => applyAdjust(item)} disabled={adjusting}
                            className="px-3 py-1 rounded-lg text-xs text-white disabled:opacity-40"
                            style={{ background: '#1D9E75' }}>
                            {adjusting ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setAdjustingId(null)} className="text-xs" style={{ color: '#6b7280' }}>Cancel</button>
                          {adjustQty && parseInt(adjustQty) !== item.stock && (
                            <span className="text-xs" style={{ color: parseInt(adjustQty) > item.stock ? '#1D9E75' : '#ef4444' }}>
                              {parseInt(adjustQty) > item.stock ? `+${parseInt(adjustQty) - item.stock}` : `${parseInt(adjustQty) - item.stock}`} change
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Expanded row */}
                  {isExpanded && (
                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <td colSpan={10} className="px-5 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Lot Information</p>
                            {item.lot_qty != null ? (
                              <p className="text-xs text-white">{item.lot_qty} units in active lots{item.earliest_expiry ? ` · Earliest expiry: ${item.earliest_expiry}` : ''}</p>
                            ) : (
                              <p className="text-xs" style={{ color: '#4b5563' }}>No lot tracking for this item</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Location</p>
                            {item.location ? (
                              <p className="text-xs text-white font-mono">{item.location}{item.zone ? ` (Zone ${item.zone})` : ''}</p>
                            ) : (
                              <p className="text-xs" style={{ color: '#4b5563' }}>No bin assigned</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Stock metrics</p>
                            <p className="text-xs" style={{ color: '#9ca3af' }}>Unit cost: A${item.cost.toFixed(2)} · 30d velocity: {item.velocity_30d} units</p>
                            <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Reorder point: {item.reorder_point} units</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
