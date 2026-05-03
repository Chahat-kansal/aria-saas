'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface ProductionOrder {
  id: string;
  order_number: string;
  finished_item_name: string;
  quantity_planned: number;
  quantity_produced: number;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  bom_id: string;
  notes: string | null;
  created_at: string;
}

interface Bom {
  id: string;
  finished_item_name: string;
  is_active: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-white/10 text-white/50',
  in_progress: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

export default function AssemblyPage() {
  const { business } = useBusinessContext();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bom_id: '', quantity_planned: '', planned_start: '', planned_end: '', notes: '' });

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [ordRes, bomRes] = await Promise.all([
      fetch(`/api/warehouse/assembly?business_id=${business.id}`).then(r => r.json()).catch(() => ({ orders: [] })),
      fetch(`/api/warehouse/bom?business_id=${business.id}`).then(r => r.json()).catch(() => ({ boms: [] })),
    ]);
    setOrders(ordRes.orders ?? []);
    setBoms((bomRes.boms ?? []).filter((b: Bom) => b.is_active));
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const counts = { draft: 0, in_progress: 0, completed: 0 };
  orders.forEach(o => {
    if (o.status === 'draft') counts.draft++;
    else if (o.status === 'in_progress') counts.in_progress++;
    else if (o.status === 'completed') counts.completed++;
  });

  async function handleSave() {
    if (!business?.id || !form.bom_id || !form.quantity_planned) return;
    setSaving(true);
    const selectedBom = boms.find(b => b.id === form.bom_id);
    await fetch('/api/warehouse/assembly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        bom_id: form.bom_id,
        finished_item_name: selectedBom?.finished_item_name ?? '',
        quantity_planned: parseFloat(form.quantity_planned),
        planned_start: form.planned_start || undefined,
        planned_end: form.planned_end || undefined,
        notes: form.notes || undefined,
      }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ bom_id: '', quantity_planned: '', planned_start: '', planned_end: '', notes: '' });
    load();
  }

  async function updateStatus(id: string, status: string) {
    if (!business?.id) return;
    await fetch(`/api/warehouse/assembly?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, status }),
    });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Assembly Orders</h1>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">New Assembly</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {([['Draft', counts.draft, 'text-white/50'], ['In Progress', counts.in_progress, 'text-amber-400'], ['Completed', counts.completed, 'text-green-400']] as const).map(([label, count, cls]) => (
          <div key={label} className="rounded-xl px-5 py-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-white/40 text-xs uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${cls}`}>{count}</p>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-white font-semibold">New Assembly Order</h2>
          <select value={form.bom_id} onChange={e => setForm(f => ({ ...f, bom_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
            <option value="">Select BOM…</option>
            {boms.map(b => <option key={b.id} value={b.id}>{b.finished_item_name}</option>)}
          </select>
          <input value={form.quantity_planned} onChange={e => setForm(f => ({ ...f, quantity_planned: e.target.value }))} placeholder="Quantity to produce" type="number" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-white/40 text-xs block mb-1">Planned Start</label><input type="date" value={form.planned_start} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" /></div>
            <div><label className="text-white/40 text-xs block mb-1">Planned End</label><input type="date" value={form.planned_end} onChange={e => setForm(f => ({ ...f, planned_end: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" /></div>
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Create Order'}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {loading ? (
          <p className="text-white/40 text-sm p-6">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-white/40 text-sm p-6">No assembly orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Order #</th><th className="text-left px-4 py-3">Product</th><th className="text-left px-4 py-3">Planned</th><th className="text-left px-4 py-3">Produced</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Start</th><th className="text-left px-4 py-3">End</th><th className="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white font-mono text-xs">{o.order_number}</td>
                  <td className="px-4 py-3 text-white">{o.finished_item_name}</td>
                  <td className="px-4 py-3 text-white/60">{o.quantity_planned}</td>
                  <td className="px-4 py-3 text-white/60">{o.quantity_produced}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status] ?? 'bg-white/10 text-white/50'}`}>{o.status.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-white/40 text-xs">{o.planned_start ?? '—'}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">{o.planned_end ?? '—'}</td>
                  <td className="px-4 py-3 flex gap-2">
                    {o.status === 'draft' && <button onClick={() => updateStatus(o.id, 'in_progress')} className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30">Start</button>}
                    {o.status === 'in_progress' && <button onClick={() => updateStatus(o.id, 'completed')} className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">Complete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
