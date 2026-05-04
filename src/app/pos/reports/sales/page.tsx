'use client';
import { useState, useEffect } from 'react';

interface Sale {
  id: string; sale_number: string; total_amount: number; tax_amount: number;
  discount_amount: number; payment_method: string; status: string; created_at: string;
  served_by?: string | null;
  pos_customers?: { name: string } | null;
}
interface DayRevenue { date: string; revenue: number; }

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }

export default function SalesReportPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [chart, setChart] = useState<DayRevenue[]>([]);
  const [summary, setSummary] = useState<{ total: number; count: number; avg: number }>({ total: 0, count: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => fmtDate(new Date(Date.now() - 29 * 86400000)));
  const [to,   setTo]   = useState(() => fmtDate(new Date()));
  const [range, setRange] = useState<'7' | '30' | '90' | 'custom'>('30');

  useEffect(() => {
    if (range !== 'custom') {
      const days = parseInt(range);
      setFrom(fmtDate(new Date(Date.now() - (days - 1) * 86400000)));
      setTo(fmtDate(new Date()));
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pos/reports/sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        setSales(d.sales ?? []);
        setChart(d.revenue_by_day ?? []);
        const total = (d.total_revenue_cents ?? 0) / 100;
        const count = d.transaction_count ?? 0;
        setSummary({ total, count, avg: count > 0 ? total / count : 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [from, to]);

  const maxRev = Math.max(...chart.map(d => d.revenue), 1);

  return (
    <div className="min-h-full">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1a1a16]">Sales Report</h1>
            <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{summary.count} transactions · A${summary.total.toFixed(2)} total</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(['7','30','90'] as const).map(d => (
              <button key={d} onClick={() => setRange(d)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${range === d ? 'bg-violet-600 border-violet-600 text-white' : 'border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.6)]'}`}>
                {d === '7' ? 'Week' : d === '30' ? 'Month' : '90 days'}
              </button>
            ))}
            <button onClick={() => setRange('custom')} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${range === 'custom' ? 'bg-violet-600 border-violet-600 text-white' : 'border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.6)]'}`}>Custom</button>
            {range === 'custom' && (
              <>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-1.5 text-xs text-[#1a1a16] outline-none" />
                <span className="text-xs text-[rgba(26,26,22,.4)]">to</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-1.5 text-xs text-[#1a1a16] outline-none" />
              </>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total revenue',    value: `A$${summary.total.toFixed(2)}` },
            { label: 'Transactions',     value: summary.count.toString() },
            { label: 'Average basket',   value: `A$${summary.avg.toFixed(2)}` },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] px-5 py-4 shadow-sm">
              <p className="text-xs text-[rgba(26,26,22,.4)] uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-2xl font-bold font-mono text-[#1a1a16]">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Revenue bar chart */}
        {chart.length > 0 && (
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] px-5 py-4 mb-6 shadow-sm">
            <p className="text-xs font-medium text-[rgba(26,26,22,.5)] uppercase tracking-wider mb-3">Revenue by day</p>
            <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
              {chart.map(d => (
                <div key={d.date} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: 28 }}>
                  <div className="w-5 rounded-t-sm bg-violet-500 opacity-80 transition-all hover:opacity-100"
                    style={{ height: `${Math.max(4, (d.revenue / maxRev) * 96)}px` }}
                    title={`${d.date}: A$${d.revenue.toFixed(2)}`} />
                  <span className="text-[9px] text-[rgba(26,26,22,.3)] rotate-45 origin-left">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales table */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
                {['Sale #', 'Date/Time', 'Customer', 'Cashier', 'Payment', 'Tax (GST)', 'Total', 'Status'].map(h => (
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
                  <td className="px-4 py-3 text-xs font-mono font-medium text-violet-600">{s.sale_number ?? s.id.slice(-8)}</td>
                  <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">
                    {new Date(s.created_at).toLocaleDateString('en-AU')}<br/>
                    <span className="text-[10px] text-[rgba(26,26,22,.35)]">{new Date(s.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.7)]">{(s.pos_customers as any)?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">{s.served_by ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${s.payment_method === 'cash' ? 'bg-green-50 text-green-700' : s.payment_method === 'card' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {s.payment_method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">A${(s.tax_amount ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#1a1a16]">A${s.total_amount.toFixed(2)}</td>
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
