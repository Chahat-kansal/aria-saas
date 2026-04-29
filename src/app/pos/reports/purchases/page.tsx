'use client';
import { useState, useEffect } from 'react';

interface PO { id: string; po_number: string; supplier_name: string | null; total_amount: number | null; status: string; created_at: string; }

export default function PurchaseReportsPage() {
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pos/orders?from=${from}&to=${to}`).then(r => r.json()).then(d => { setOrders(d.orders ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, [from, to]);

  const total = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const bySupplier: Record<string, number> = {};
  for (const o of orders) { const k = o.supplier_name ?? 'Unknown'; bySupplier[k] = (bySupplier[k] ?? 0) + (o.total_amount ?? 0); }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1a1a16]">Purchase Reports</h1>
        <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Purchase orders by supplier and date range</p>
      </div>
      <div className="flex gap-3 mb-6">
        <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl text-sm border border-[rgba(0,0,0,.1)] outline-none" /></div>
        <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl text-sm border border-[rgba(0,0,0,.1)] outline-none" /></div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[{ label: 'Total orders', value: orders.length }, { label: 'Suppliers', value: Object.keys(bySupplier).length }, { label: 'Total value', value: `A$${total.toFixed(2)}` }].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-[rgba(0,0,0,.06)] p-4 shadow-sm"><p className="text-xs text-[rgba(26,26,22,.4)] mb-1">{s.label}</p><p className="text-2xl font-semibold text-[#1a1a16]">{s.value}</p></div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[rgba(0,0,0,.06)]">{['PO #','Supplier','Date','Total','Status'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[rgba(26,26,22,.4)]">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.35)]">Loading…</td></tr>
            : orders.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.35)]">No purchase orders in this range</td></tr>
            : orders.map(o => (
              <tr key={o.id} className="border-b border-[rgba(0,0,0,.04)]">
                <td className="px-4 py-3 font-mono font-bold text-xs text-[#1a1a16]">{o.po_number ?? o.id.slice(0,8)}</td>
                <td className="px-4 py-3 text-[rgba(26,26,22,.7)]">{o.supplier_name ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-semibold text-[#1a1a16]">{o.total_amount ? `A$${o.total_amount.toFixed(2)}` : '—'}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${o.status === 'received' ? 'bg-green-100 text-green-700' : o.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
