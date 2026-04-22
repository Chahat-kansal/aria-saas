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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Sales history</h1>
          <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">{sales.length} total · ${totalRevenue.toFixed(2)} completed revenue</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {['all', 'completed', 'pending', 'voided', 'refunded'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[10px] px-3 py-1.5 rounded-full capitalize border transition-all ${filter === f ? 'bg-[rgba(249,115,22,.15)] text-[#fdba74] border-[rgba(249,115,22,.3)]' : 'text-[rgba(255,255,255,.4)] border-white/10 hover:border-white/20'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <div className="flex-1 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.07)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: '#111118', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['Sale ID', 'Customer', 'Total', 'Payment', 'Status', 'Time'].map(h => (
                  <th key={h} className="text-left text-[10px] text-[rgba(255,255,255,.35)] uppercase tracking-widest px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-xs text-[rgba(255,255,255,.25)]">Loading…</td></tr>
              ) : !filtered.length ? (
                <tr><td colSpan={6} className="text-center py-12 text-xs text-[rgba(255,255,255,.25)]">No sales found</td></tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id}
                    onClick={() => setSelected(selected?.id === s.id ? null : s)}
                    className={`border-b border-white/5 last:border-0 cursor-pointer transition-colors ${selected?.id === s.id ? 'bg-[rgba(249,115,22,.06)]' : 'hover:bg-white/[.02]'}`}>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-[rgba(255,255,255,.55)]">#{s.id.slice(-8).toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[rgba(255,255,255,.65)]">
                        {s.pos_customers?.name || 'Walk-in'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-white">${Number(s.total_amount || 0).toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-[rgba(255,255,255,.4)] capitalize">{s.payment_method || '—'}</span>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-[rgba(255,255,255,.3)]">
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
          <div className="w-64 flex-shrink-0 rounded-2xl p-4" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">Sale detail</h3>
              <button onClick={() => setSelected(null)} className="text-[rgba(255,255,255,.3)] hover:text-white text-xs">✕</button>
            </div>
            <p className="text-[10px] text-[rgba(255,255,255,.35)] mb-3 font-mono">#{selected.id.slice(-12).toUpperCase()}</p>

            {selected.pos_sale_items?.length ? (
              <ul className="space-y-2 mb-4">
                {selected.pos_sale_items.map((item, i) => (
                  <li key={i} className="flex justify-between text-xs">
                    <span className="text-[rgba(255,255,255,.65)]">{item.pos_products?.name || 'Product'} ×{item.quantity}</span>
                    <span className="text-white">${(item.unit_price * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[10px] text-[rgba(255,255,255,.25)] mb-4">No line items</p>}

            <div className="border-t border-white/5 pt-3 flex justify-between text-xs font-semibold text-white">
              <span>Total</span>
              <span>${Number(selected.total_amount).toFixed(2)}</span>
            </div>

            {selected.status === 'completed' && (
              <button onClick={() => voidSale(selected.id)}
                className="w-full mt-4 py-2 rounded-lg text-[11px] text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors">
                Void sale
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    completed: ['#34d399', 'rgba(52,211,153,.12)'],
    pending:   ['#fbbf24', 'rgba(251,191,36,.12)'],
    voided:    ['#f87171', 'rgba(248,113,113,.12)'],
    refunded:  ['#60a5fa', 'rgba(96,165,250,.12)'],
  };
  const [color, bg] = map[status] ?? ['rgba(255,255,255,.35)', 'rgba(255,255,255,.05)'];
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full capitalize" style={{ color, background: bg }}>{status}</span>
  );
}