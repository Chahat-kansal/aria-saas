'use client';
import { useState, useEffect } from 'react';

interface CashierRow {
  name: string;
  sales_count: number;
  revenue: number;
  cash_sales: number;
  card_sales: number;
  refunds: number;
  avg_basket: number;
}

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }

export default function CashierReportPage() {
  const [rows,    setRows]    = useState<CashierRow[]>([]);
  const [totals,  setTotals]  = useState<{ total_revenue: number; total_sales: number; cashier_count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => fmtDate(new Date(Date.now() - 29 * 86400000)));
  const [to,   setTo]   = useState(() => fmtDate(new Date()));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pos/reports/cashier?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.by_cashier ?? []);
        setTotals(d.totals ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [from, to]);

  return (
    <div className="min-h-full bg-gray-50 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cashier Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Sales performance by staff member</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none bg-white text-gray-700" />
          <span className="text-sm text-gray-400">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none bg-white text-gray-700" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total revenue',    value: `A$${(totals?.total_revenue ?? 0).toFixed(2)}` },
            { label: 'Total sales',      value: String(totals?.total_sales ?? 0) },
            { label: 'Active cashiers',  value: String(totals?.cashier_count ?? 0) },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-2xl font-bold font-mono text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <p className="text-gray-400 text-sm">No sales data for this period.</p>
            <p className="text-gray-300 text-xs mt-1">Make sure staff enter their name in the &ldquo;Sale by&rdquo; field on the terminal.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3 border-b border-gray-100 bg-gray-50"
              style={{ gridTemplateColumns: '1fr 80px 120px 100px 100px 100px 100px' }}>
              <span>Cashier</span>
              <span className="text-right">Sales</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">Cash</span>
              <span className="text-right">Card</span>
              <span className="text-right">Refunds</span>
              <span className="text-right">Avg basket</span>
            </div>
            {rows.map((row, i) => (
              <div key={row.name}
                className={`grid px-4 py-3 text-sm items-center border-b border-gray-50 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                style={{ gridTemplateColumns: '1fr 80px 120px 100px 100px 100px 100px' }}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 flex-shrink-0">
                    {row.name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="font-medium text-gray-900">{row.name}</span>
                </div>
                <span className="text-right text-gray-600">{row.sales_count}</span>
                <span className="text-right font-semibold font-mono text-gray-900">A${row.revenue.toFixed(2)}</span>
                <span className="text-right font-mono text-gray-500">A${row.cash_sales.toFixed(2)}</span>
                <span className="text-right font-mono text-gray-500">A${row.card_sales.toFixed(2)}</span>
                <span className="text-right font-mono text-red-500">{row.refunds > 0 ? `A${row.refunds.toFixed(2)}` : '—'}</span>
                <span className="text-right font-mono text-gray-500">A${row.avg_basket.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
