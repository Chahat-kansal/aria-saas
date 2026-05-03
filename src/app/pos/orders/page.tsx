'use client';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';
import { useState, useEffect } from 'react';

interface Supplier { id: string; name: string; }
interface Order {
  id: string; order_number: string; supplier_id: string | null; status: string;
  total_amount: number; expected_date: string | null; created_at: string;
  pos_suppliers?: { name: string } | null;
}

const STATUSES = ['draft', 'sent', 'received', 'partial', 'cancelled'];
const EMPTY = { supplier_id: '', expected_date: '', notes: '', status: 'draft' };

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/pos/orders').then(r => r.json()),
      fetch('/api/pos/suppliers').then(r => r.json()),
    ]).then(([o, s]) => { setOrders(o.orders ?? []); setSuppliers(s.suppliers ?? []); setLoading(false); });
  }, []);

  async function create() {
    setSaving(true);
    const res = await fetch('/api/pos/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_id: form.supplier_id || null, expected_date: form.expected_date || null, notes: form.notes || null, status: form.status }),
    });
    const d = await res.json();
    if (d.order) setOrders(os => [d.order, ...os]);
    setSaving(false); setModal(false); setForm({ ...EMPTY });
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-[rgba(0,0,0,.05)] text-[rgba(26,26,22,.5)]',
    sent: 'bg-blue-50 text-blue-700',
    received: 'bg-emerald-50 text-emerald-700',
    partial: 'bg-amber-50 text-amber-700',
    cancelled: 'bg-red-50 text-red-600',
  };

  return (
    <div className="min-h-full">
      <POSAriaInsight page="pos/orders" />
      <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Orders &amp; Invoices</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{orders.length} purchase orders</p>
        </div>
        <button onClick={() => setModal(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
          + New Order
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
              {['Order #', 'Supplier', 'Status', 'Expected', 'Total', 'Created'].map(h => (
                <th key={h} className="text-left text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-xs text-[rgba(26,26,22,.3)]">Loading…</td></tr>
            ) : !orders.length ? (
              <tr><td colSpan={6} className="text-center py-16 text-xs text-[rgba(26,26,22,.3)]">No orders yet</td></tr>
            ) : orders.map(o => (
              <tr key={o.id} className="border-b border-[rgba(0,0,0,.04)] last:border-0 hover:bg-[rgba(0,0,0,.01)]">
                <td className="px-4 py-3 text-xs font-mono font-medium text-[#2563eb]">{o.order_number}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.7)]">{o.pos_suppliers?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[o.status] ?? ''}`}>{o.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">{o.expected_date ?? '—'}</td>
                <td className="px-4 py-3 text-sm font-semibold text-[#1a1a16]">${(o.total_amount ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.45)]">{new Date(o.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a16]">New Purchase Order</h2>
              <button onClick={() => setModal(false)} className="text-[rgba(26,26,22,.4)] text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Supplier</label>
                <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]">
                  <option value="">No supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Expected Date</label>
                <input type="date" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))}
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(0,0,0,.08)] flex justify-end gap-2">
              <button onClick={() => setModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)] hover:bg-[rgba(0,0,0,.04)]">Cancel</button>
              <button onClick={create} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                {saving ? 'Creating…' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}