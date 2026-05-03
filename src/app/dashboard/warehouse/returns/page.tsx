'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface ReturnRecord {
  id: string;
  rma_number: string;
  return_type: string;
  customer_name: string | null;
  supplier_name: string | null;
  reason: string;
  items: Array<{ item_name: string; quantity: number; credit_cents?: number }>;
  total_credit_cents: number;
  status: string;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  received: 'bg-blue-500/20 text-blue-400',
  inspected: 'bg-purple-500/20 text-purple-400',
  restocked: 'bg-green-500/20 text-green-400',
  disposed: 'bg-red-500/20 text-red-400',
  credit_issued: 'bg-emerald-500/20 text-emerald-400',
};

const REASONS = ['Changed mind', 'Damaged in transit', 'Wrong item', 'Defective', 'Expired', 'Other'];
const STATUSES = ['received', 'inspected', 'restocked', 'disposed', 'credit_issued'];

export default function ReturnsPage() {
  const { business } = useBusinessContext();
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    return_type: 'customer',
    customer_name: '',
    customer_contact: '',
    supplier_name: '',
    reason: REASONS[0],
    item_desc: '',
    item_qty: '1',
    credit: '',
    notes: '',
  });

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/warehouse/returns?business_id=${business.id}`).then(r => r.json()).catch(() => ({ returns: [] }));
    setReturns(res.returns ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const customerCount = returns.filter(r => r.return_type === 'customer').length;
  const supplierCount = returns.filter(r => r.return_type === 'supplier').length;

  async function handleSave() {
    if (!business?.id) return;
    setSaving(true);
    const credit_cents = Math.round(parseFloat(form.credit || '0') * 100);
    const items = [{ item_name: form.item_desc, quantity: parseInt(form.item_qty) || 1, action: 'restock', credit_cents }];
    await fetch('/api/warehouse/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        return_type: form.return_type,
        customer_name: form.return_type === 'customer' ? form.customer_name : undefined,
        customer_contact: form.return_type === 'customer' ? form.customer_contact : undefined,
        supplier_name: form.return_type === 'supplier' ? form.supplier_name : undefined,
        reason: form.reason,
        items,
        notes: form.notes || undefined,
      }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ return_type: 'customer', customer_name: '', customer_contact: '', supplier_name: '', reason: REASONS[0], item_desc: '', item_qty: '1', credit: '', notes: '' });
    load();
  }

  async function updateStatus(id: string, status: string) {
    if (!business?.id) return;
    await fetch(`/api/warehouse/returns?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, status }),
    });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Returns (RMA)</h1>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">New RMA</button>
      </div>

      <div className="flex gap-3">
        <span className="px-3 py-1.5 rounded-full text-sm bg-blue-500/20 text-blue-300">Customer returns: {customerCount}</span>
        <span className="px-3 py-1.5 rounded-full text-sm bg-purple-500/20 text-purple-300">Supplier returns: {supplierCount}</span>
      </div>

      {showAdd && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-white font-semibold">New RMA</h2>
          <div className="flex gap-2">
            {(['customer', 'supplier'] as const).map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, return_type: t }))} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${form.return_type === t ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          {form.return_type === 'customer' ? (
            <div className="grid grid-cols-2 gap-3">
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Customer name" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
              <input value={form.customer_contact} onChange={e => setForm(f => ({ ...f, customer_contact: e.target.value }))} placeholder="Contact (email/phone)" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
            </div>
          ) : (
            <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} placeholder="Supplier name" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          )}
          <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-3">
            <input value={form.item_desc} onChange={e => setForm(f => ({ ...f, item_desc: e.target.value }))} placeholder="Item description" className="col-span-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
            <input value={form.item_qty} onChange={e => setForm(f => ({ ...f, item_qty: e.target.value }))} placeholder="Qty" type="number" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
            <input value={form.credit} onChange={e => setForm(f => ({ ...f, credit: e.target.value }))} placeholder="Credit A$" type="number" step="0.01" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Create RMA'}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {loading ? (
          <p className="text-white/40 text-sm p-6">Loading…</p>
        ) : returns.length === 0 ? (
          <p className="text-white/40 text-sm p-6">No returns yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">RMA #</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Customer / Supplier</th><th className="text-left px-4 py-3">Items</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Created</th><th className="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {returns.map(r => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white font-mono text-xs">{r.rma_number}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.return_type === 'customer' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>{r.return_type}</span></td>
                  <td className="px-4 py-3 text-white/80">{r.customer_name ?? r.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 text-white/60">{r.items?.length ?? 0} item{(r.items?.length ?? 0) !== 1 ? 's' : ''}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? 'bg-white/10 text-white/50'}`}>{r.status.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <select defaultValue="" onChange={e => { if (e.target.value) updateStatus(r.id, e.target.value); }} className="text-xs bg-white/5 border border-white/10 text-white/60 rounded px-2 py-1">
                      <option value="">Update…</option>
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
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
