'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface QItem {
  id: string; item_id: string; item_name: string; lot_id: string | null;
  quantity: number; reason: string; status: string;
  quarantined_by: string | null; quarantined_at: string; notes: string | null;
}

const REASON_LABELS: Record<string, string> = {
  quality_hold: 'Quality hold', damaged: 'Damaged', supplier_dispute: 'Supplier dispute',
  expired: 'Expired', recall: 'Recall', other: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  quarantined: '#fbbf24', released: '#1D9E75', disposed: '#ef4444', returned_to_supplier: '#818cf8',
};

function daysInQuarantine(date: string) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

export default function QuarantinePage() {
  const { business } = useBusinessContext();
  const [items, setItems] = useState<QItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('quarantined');
  const [inspecting, setInspecting] = useState<QItem | null>(null);
  const [resolution, setResolution] = useState('');
  const [releaseQty, setReleaseQty] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    const d = await fetch(`/api/warehouse/quarantine?business_id=${business.id}&status=${statusFilter}`).then(r => r.json());
    setItems(d.items ?? []);
    setLoading(false);
  }, [business?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: string, qty?: number) {
    if (!business?.id) return;
    setSaving(true);
    await fetch('/api/warehouse/quarantine', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, business_id: business.id, status, resolution, quantity_released: qty }),
    });
    setSaving(false);
    setInspecting(null);
    setResolution('');
    setReleaseQty('');
    load();
  }

  const activeCount = items.filter(i => i.status === 'quarantined').length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Quarantine Zone</h1>
        <p style={{ color: '#6b7280' }} className="mt-1">Items held pending quality inspection or dispute resolution</p>
      </div>

      {activeCount > 0 && (
        <div className="rounded-xl p-4 mb-5 flex items-center gap-3" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <span className="text-amber-400 text-lg">⚠</span>
          <p className="text-sm text-amber-300 font-medium">{activeCount} item{activeCount !== 1 ? 's' : ''} currently in quarantine — not available for sale or picking</p>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-5">
        {['quarantined', 'released', 'disposed', 'returned_to_supplier', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-lg text-xs capitalize transition-all"
            style={{
              background: statusFilter === s ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.04)',
              color: statusFilter === s ? '#1D9E75' : '#6b7280',
              border: `1px solid ${statusFilter === s ? 'rgba(29,158,117,0.4)' : 'rgba(255,255,255,0.07)'}`,
            }}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <p className="text-2xl mb-2">✓</p>
          <p className="text-sm">No items in quarantine</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium text-sm">{item.item_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ color: STATUS_COLORS[item.status] ?? '#6b7280', background: 'rgba(255,255,255,0.06)' }}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                    <span>Qty: <span className="text-white font-medium">{item.quantity}</span></span>
                    <span>Reason: <span className="text-white">{REASON_LABELS[item.reason] ?? item.reason}</span></span>
                    <span>Days held: <span className={daysInQuarantine(item.quarantined_at) > 14 ? 'text-amber-400 font-medium' : 'text-white'}>
                      {daysInQuarantine(item.quarantined_at)}d
                    </span></span>
                    {item.quarantined_by && <span>By: {item.quarantined_by}</span>}
                  </div>
                  {item.notes && <p className="text-xs text-gray-500 mt-1">"{item.notes}"</p>}
                </div>
                {item.status === 'quarantined' && (
                  <button onClick={() => { setInspecting(item); setReleaseQty(String(item.quantity)); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                    style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
                    Inspect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspection modal */}
      {inspecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: '#1a1a25', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-white font-semibold mb-1">Quality Inspection</h2>
            <p className="text-xs text-gray-400 mb-4">{inspecting.item_name} — {inspecting.quantity} units</p>
            <div className="mb-4">
              <label className="text-xs text-gray-400 mb-1 block">Resolution / Notes</label>
              <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                placeholder="Inspection findings…" />
            </div>
            <div className="mb-5">
              <label className="text-xs text-gray-400 mb-1 block">Quantity to release (if partial)</label>
              <input type="number" min="1" max={inspecting.quantity} value={releaseQty}
                onChange={e => setReleaseQty(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => updateStatus(inspecting.id, 'released', parseInt(releaseQty) || inspecting.quantity)} disabled={saving}
                className="py-2.5 rounded-lg text-xs font-medium disabled:opacity-40"
                style={{ background: 'rgba(29,158,117,0.2)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.3)' }}>
                Release to stock
              </button>
              <button onClick={() => updateStatus(inspecting.id, 'disposed')} disabled={saving}
                className="py-2.5 rounded-lg text-xs font-medium disabled:opacity-40"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                Dispose
              </button>
              <button onClick={() => updateStatus(inspecting.id, 'returned_to_supplier')} disabled={saving}
                className="py-2.5 rounded-lg text-xs font-medium disabled:opacity-40"
                style={{ background: 'rgba(129,140,248,0.1)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.2)' }}>
                Return to supplier
              </button>
            </div>
            <button onClick={() => setInspecting(null)} className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
