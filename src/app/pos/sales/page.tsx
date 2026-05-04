'use client';
import { useState, useEffect } from 'react';

interface Sale {
  id: string; total_amount: number; payment_method: string; status: string;
  created_at: string; customer_id: string | null;
  pos_customers?: { name: string } | null;
  pos_sale_items?: { quantity: number; unit_price: number; pos_products?: { name: string } | null }[];
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/pos/sales')
      .then(r => r.json())
      .then(d => { setSales(d.sales || []); setLoading(false); });
  }, []);

  const filtered = sales.filter(s => filter === 'all' || s.status === filter);
  const totalRevenue = sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + (s.total_amount || 0), 0);

  const voidSale = async (id: string) => {
    await fetch(`/api/pos/sales?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'voided' }),
    });
    setSales(ss => ss.map(s => s.id === id ? { ...s, status: 'voided' } : s));
    if (selected?.id === id) setSelected(s => s ? { ...s, status: 'voided' } : null);
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales history</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {sales.length} total · A${totalRevenue.toFixed(2)} completed revenue
          </p>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex gap-2 mb-4 flex-wrap">
          {['all', 'completed', 'pending', 'voided', 'refunded'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[10px] px-3 py-1.5 rounded-full capitalize border transition-all ${
                filter === f
                  ? 'bg-orange-50 text-orange-600 border-orange-200 font-medium'
                  : 'text-gray-500 border-gray-200 hover:border-gray-300 bg-white'
              }`}>
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <div className="flex-1 bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Sale ID', 'Customer', 'Total', 'Payment', 'Status', 'Time'].map(h => (
                    <th key={h} className="text-left text-[10px] text-gray-400 uppercase tracking-widest px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-xs text-gray-400">Loading…</td></tr>
                ) : !filtered.length ? (
                  <tr><td colSpan={6} className="text-center py-12 text-xs text-gray-400">No sales found</td></tr>
                ) : (
                  filtered.map(s => (
                    <tr key={s.id}
                      onClick={() => setSelected(selected?.id === s.id ? null : s)}
                      className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${
                        selected?.id === s.id ? 'bg-orange-50' : 'hover:bg-gray-50'
                      }`}>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-500">#{s.id.slice(-8).toUpperCase()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-700">{s.pos_customers?.name || 'Walk-in'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold font-mono text-gray-900">A${Number(s.total_amount || 0).toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-gray-500 capitalize">{s.payment_method || '—'}</span>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-gray-400">
                          {new Date(s.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="w-64 flex-shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Sale detail</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              </div>
              <p className="text-[10px] text-gray-400 mb-3 font-mono">#{selected.id.slice(-12).toUpperCase()}</p>

              {selected.pos_sale_items?.length ? (
                <ul className="space-y-2 mb-4">
                  {selected.pos_sale_items.map((item, i) => (
                    <li key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600">{item.pos_products?.name || 'Product'} ×{item.quantity}</span>
                      <span className="font-mono text-gray-900 font-medium">A${(item.unit_price * item.quantity).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[10px] text-gray-400 mb-4">No line items</p>}

              <div className="border-t border-gray-100 pt-3 flex justify-between text-xs font-semibold text-gray-900">
                <span>Total</span>
                <span className="font-mono">A${Number(selected.total_amount).toFixed(2)}</span>
              </div>

              {selected.status === 'completed' && (
                <button onClick={() => voidSale(selected.id)}
                  className="w-full mt-4 py-2 rounded-lg text-[11px] text-red-500 hover:bg-red-50 border border-red-200 transition-colors">
                  Void sale
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    completed: ['text-violet-700', 'bg-violet-50 border-violet-200'],
    pending:   ['text-amber-700',   'bg-amber-50 border-amber-200'],
    voided:    ['text-red-600',     'bg-red-50 border-red-200'],
    refunded:  ['text-blue-700',    'bg-blue-50 border-blue-200'],
  };
  const [textCls, bgCls] = map[status] ?? ['text-gray-500', 'bg-gray-50 border-gray-200'];
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize border ${textCls} ${bgCls}`}>{status}</span>
  );
}
