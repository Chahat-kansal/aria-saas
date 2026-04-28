'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Lot { id: string; item_name: string; lot_number: string; supplier_name: string | null; received_at: string; quantity_remaining: number; unit_cost_cents: number | null; expiry_date: string | null; status: string; item_id: string; }

const STATUS_OPTS = ['all', 'active', 'expiring', 'expired', 'depleted', 'recalled'] as const;

function daysUntil(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default function LotsPage() {
  const { business } = useBusinessContext();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [adjustModal, setAdjustModal] = useState<{ lot: Lot; qty: number; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (filterVal = filter) => {
    if (!business?.id) return;
    setLoading(true);
    const params = new URLSearchParams({ business_id: business.id });
    if (filterVal === 'expiring') params.set('expiring', '30');
    const res = await fetch(`/api/warehouse/lots?${params}`).then(r => r.json()).catch(() => ({ lots: [] }));
    let data: Lot[] = res.lots ?? [];
    if (filterVal === 'expired') data = data.filter(l => l.expiry_date && new Date(l.expiry_date) < new Date());
    if (filterVal === 'depleted') data = data.filter(l => l.status === 'depleted');
    if (filterVal === 'recalled') data = data.filter(l => l.status === 'recalled');
    setLots(data);
    setLoading(false);
  }, [business?.id, filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = lots.filter(l => !search || l.item_name.toLowerCase().includes(search.toLowerCase()) || l.lot_number.toLowerCase().includes(search.toLowerCase()));

  const expiringSoon = lots.filter(l => { const d = daysUntil(l.expiry_date); return d !== null && d >= 0 && d <= 30; }).length;
  const expired = lots.filter(l => l.expiry_date && new Date(l.expiry_date) < new Date() && l.status === 'active').length;
  const valueAtRisk = lots.filter(l => { const d = daysUntil(l.expiry_date); return d !== null && d <= 30; }).reduce((s, l) => s + l.quantity_remaining * (l.unit_cost_cents ?? 0), 0);

  async function applyAdjust() {
    if (!adjustModal || !business?.id) return;
    setSaving(true);
    await fetch(`/api/warehouse/lots?id=${adjustModal.lot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, quantity_remaining: adjustModal.qty, reason: adjustModal.reason, item_id: adjustModal.lot.item_id }),
    });
    setSaving(false);
    setAdjustModal(null);
    load();
  }

  async function recall(lot: Lot) {
    if (!business?.id || !confirm(`Recall all ${lot.quantity_remaining} units of lot ${lot.lot_number}?`)) return;
    await fetch(`/api/warehouse/lots?id=${lot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, status: 'recalled', quantity_remaining: 0, item_id: lot.item_id, reason: 'Recall' }),
    });
    load();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Lots & Batches</h1>
        <p style={{ color: '#6b7280' }}>Track every batch from receipt to depletion. FSANZ-compliant expiry management.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active lots', value: lots.filter(l => l.status === 'active').length, color: '#fff' },
          { label: 'Expiring this month', value: expiringSoon, color: expiringSoon > 0 ? '#f59e0b' : '#1D9E75' },
          { label: 'Expired uncleared', value: expired, color: expired > 0 ? '#ef4444' : '#1D9E75' },
          { label: 'Value at risk', value: `A$${(valueAtRisk / 100).toFixed(0)}`, color: valueAtRisk > 0 ? '#ef4444' : '#1D9E75' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{c.label}</p>
            <p className="text-2xl font-semibold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product or lot…" className="px-3 py-2 rounded-xl text-sm outline-none flex-1 min-w-40" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }} />
        <div className="flex gap-1">
          {STATUS_OPTS.map(s => (
            <button key={s} onClick={() => { setFilter(s); load(s); }} className={`px-3 py-2 rounded-xl text-xs capitalize transition-colors ${filter === s ? 'text-white' : ''}`} style={filter === s ? { background: '#1D9E75' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Lot #', 'Product', 'Supplier', 'Received', 'Qty Left', 'Unit Cost', 'Expiry', 'Days', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d0d14' }}>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No lots found.</td></tr>
            ) : filtered.map(lot => {
              const days = daysUntil(lot.expiry_date);
              const isExpired = days !== null && days < 0;
              const isExpiring = days !== null && days >= 0 && days <= 30;
              return (
                <tr key={lot.id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isExpired ? 'rgba(239,68,68,0.05)' : isExpiring ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                  <td className="px-3 py-3 text-white font-mono text-xs">{lot.lot_number}</td>
                  <td className="px-3 py-3 text-white">{lot.item_name}</td>
                  <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{lot.supplier_name ?? '—'}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: '#9ca3af' }}>{new Date(lot.received_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3 text-white font-medium">{lot.quantity_remaining}</td>
                  <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{lot.unit_cost_cents ? `A$${(lot.unit_cost_cents / 100).toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{lot.expiry_date ?? '—'}</td>
                  <td className="px-3 py-3">
                    {days !== null ? <span style={{ color: isExpired ? '#ef4444' : isExpiring ? '#f59e0b' : '#1D9E75' }} className="font-medium">{days}d</span> : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${lot.status === 'active' ? 'bg-green-900/30 text-green-400' : lot.status === 'recalled' ? 'bg-red-900/30 text-red-400' : 'bg-[rgba(255,255,255,0.06)] text-gray-400'}`}>
                      {lot.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setAdjustModal({ lot, qty: lot.quantity_remaining, reason: '' })} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Adjust</button>
                      {lot.status === 'active' && <button onClick={() => recall(lot)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Recall</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Adjust modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-sm border border-[rgba(255,255,255,0.1)]">
            <h3 className="text-white font-semibold mb-4">Adjust lot quantity</h3>
            <p className="text-sm mb-3" style={{ color: '#9ca3af' }}>{adjustModal.lot.item_name} — {adjustModal.lot.lot_number}</p>
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">New quantity</label>
              <input type="number" min={0} value={adjustModal.qty} onChange={e => setAdjustModal(m => m ? { ...m, qty: parseInt(e.target.value) || 0 } : null)} className="w-full px-3 py-2 rounded-xl text-sm outline-none text-white" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">Reason</label>
              <input value={adjustModal.reason} onChange={e => setAdjustModal(m => m ? { ...m, reason: e.target.value } : null)} placeholder="e.g. Damaged, found variance" className="w-full px-3 py-2 rounded-xl text-sm outline-none text-white" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAdjustModal(null)} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={applyAdjust} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>{saving ? '…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
