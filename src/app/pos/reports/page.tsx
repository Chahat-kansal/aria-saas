'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Summary {
  total_revenue: number; total_tax: number; total_discount: number;
  transaction_count: number; cash_sales: number; card_sales: number; avg_transaction: number;
}
interface DayRow { date: string; revenue: number; count: number; }

function fmt(from: Date) { return from.toISOString().slice(0, 10); }

export default function ReportsDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => fmt(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => fmt(new Date()));

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pos/reports?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setSummary(d.summary); setDaily(d.daily ?? []); setLoading(false); });
  }, [from, to]);

  const maxRev = Math.max(...daily.map(d => d.revenue), 1);

  const REPORT_LINKS = [
    { label: 'Sales Reports', href: '/pos/reports/sales', desc: 'Detailed transaction history' },
    { label: 'Inventory Reports', href: '/pos/reports/inventory', desc: 'Stock levels and movements' },
    { label: 'Purchase Reports', href: '/pos/reports/purchases', desc: 'Supplier orders and invoices' },
    { label: 'Transfer Reports', href: '/pos/reports/transfers', desc: 'Inter-outlet stock transfers' },
    { label: 'Register Closures', href: '/pos/reports/closures', desc: 'End of day session summaries' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Reporting Dashboard</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Business performance overview</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-xs text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
          <span className="text-xs text-[rgba(26,26,22,.4)]">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-xs text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Revenue', value: `$${(summary?.total_revenue ?? 0).toFixed(2)}`, color: '#16a34a' },
          { label: 'Transactions', value: String(summary?.transaction_count ?? 0), color: '#2563eb' },
          { label: 'Avg Transaction', value: `$${(summary?.avg_transaction ?? 0).toFixed(2)}`, color: '#7c3aed' },
          { label: 'Tax Collected', value: `$${(summary?.total_tax ?? 0).toFixed(2)}`, color: '#d97706' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm">
            <p className="text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold" style={{ color }}>{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      {/* Payment split */}
      {summary && (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm mb-6">
          <p className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-3">Payment Methods</p>
          <div className="flex items-center gap-4">
            {[
              { label: 'Cash', value: summary.cash_sales, color: '#16a34a' },
              { label: 'Card', value: summary.card_sales, color: '#2563eb' },
            ].map(({ label, value, color }) => {
              const pct = summary.total_revenue > 0 ? (value / summary.total_revenue) * 100 : 0;
              return (
                <div key={label} className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[rgba(26,26,22,.6)]">{label}</span>
                    <span className="text-xs font-semibold text-[#1a1a16]">${value.toFixed(2)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[rgba(0,0,0,.06)]">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <p className="text-[10px] text-[rgba(26,26,22,.35)] mt-0.5">{pct.toFixed(0)}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily revenue chart */}
      {daily.length > 0 && (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm mb-6">
          <p className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-4">Daily Revenue</p>
          <div className="flex items-end gap-1 h-32">
            {daily.map(d => {
              const h = (d.revenue / maxRev) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.date}: $${d.revenue.toFixed(2)}`}>
                  <div className="w-full rounded-t transition-all" style={{ height: `${Math.max(h, 2)}%`, background: '#2563eb', opacity: 0.75 }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-[rgba(26,26,22,.3)]">{daily[0]?.date}</span>
            <span className="text-[9px] text-[rgba(26,26,22,.3)]">{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Report links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORT_LINKS.map(r => (
          <Link key={r.href} href={r.href}
            className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm hover:border-[#2563eb] hover:shadow-md transition-all group">
            <p className="text-[13px] font-semibold text-[#1a1a16] group-hover:text-[#2563eb] transition-colors">{r.label}</p>
            <p className="text-[11px] text-[rgba(26,26,22,.45)] mt-0.5">{r.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}