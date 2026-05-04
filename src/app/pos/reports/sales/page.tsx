'use client';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';
import { useState, useEffect } from 'react';

interface Sale {
  id: string; sale_number: string; total_amount: number; tax_amount: number;
  discount_amount: number; payment_method: string; status: string; created_at: string;
  pos_customers?: { name: string } | null;
}

export default function SalesReportPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pos/sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setSales(d.sales ?? []); setLoading(false); });
  }, [from, to]);

  const total = sales.reduce((s, r) => s + r.total_amount, 0);

  return (
    <div className="min-h-full">
      <POSAriaInsight page="pos/reports/sales" />
      <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Sales Reports</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{sales.length} transactions · ${total.toFixed(2)} total</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-xs text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
          <span className="text-xs text-[rgba(26,26,22,.4)]">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-xs text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
              {['Sale #', 'Date', 'Customer', 'Payment', 'Discount', 'Tax', 'Total', 'Status'].map(h => (
                <th key={h} className="text-left text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-xs text-[rgba(26,26,22,.3)]">Loading…</td></tr>
            ) : !sales.length ? (
              <tr><td colSpan={8} className="text-center py-16 text-xs text-[rgba(26,26,22,.3)]">No sales in this period</td></tr>
            ) : sales.map(s => (
              <tr key={s.id} className="border-b border-[rgba(0,0,0,.04)] last:border-0 hover:bg-[rgba(0,0,0,.01)]">
                <td className="px-4 py-3 text-xs font-mono font-medium text-[#2563eb]">{s.sale_number}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">{new Date(s.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.7)]">{s.pos_customers?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${s.payment_method === 'cash' ? 'bg-violet-50 text-violet-700' : s.payment_method === 'card' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                    {s.payment_method}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">${(s.discount_amount ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">${(s.tax_amount ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-[#1a1a16]">${s.total_amount.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.status === 'completed' ? 'bg-violet-50 text-violet-700' : s.status === 'refunded' ? 'bg-red-50 text-red-600' : 'bg-[rgba(0,0,0,.05)] text-[rgba(26,26,22,.5)]'}`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}