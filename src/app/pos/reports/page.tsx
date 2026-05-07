'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const iStyle: React.CSSProperties = { background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit' };

interface Summary {
  total_revenue: number; total_tax: number; total_discount: number;
  transaction_count: number; cash_sales: number; card_sales: number; avg_transaction: number;
}
interface DayRow { date: string; revenue: number; count: number; }

function fmt(from: Date) { return from.toISOString().slice(0, 10); }

const REPORT_LINKS = [
  { label: 'Sales Reports',     href: '/pos/reports/sales',     desc: 'Detailed transaction history' },
  { label: 'Inventory Reports', href: '/pos/reports/inventory',  desc: 'Stock levels and movements' },
  { label: 'Purchase Reports',  href: '/pos/reports/purchases',  desc: 'Supplier orders and invoices' },
  { label: 'Transfer Reports',  href: '/pos/reports/transfers',  desc: 'Inter-outlet stock transfers' },
  { label: 'Register Closures', href: '/pos/reports/closures',   desc: 'End of day session summaries' },
];

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

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Reporting Dashboard</h1>
          <p style={{ fontSize: 12, color: C.muted }}>Business performance overview</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={iStyle} />
          <span style={{ fontSize: 12, color: C.muted }}>to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={iStyle} />
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total Revenue',    value: `$${(summary?.total_revenue ?? 0).toFixed(2)}`,    color: C.green },
          { label: 'Transactions',     value: String(summary?.transaction_count ?? 0),            color: '#38BDF8' },
          { label: 'Avg Transaction',  value: `$${(summary?.avg_transaction ?? 0).toFixed(2)}`,  color: C.violet },
          { label: 'Tax Collected',    value: `$${(summary?.total_tax ?? 0).toFixed(2)}`,         color: C.amber },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
            <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: loading ? C.dim : color, fontFamily: "'JetBrains Mono',monospace" }}>
              {loading ? '—' : value}
            </p>
          </div>
        ))}
      </div>

      {/* Payment split */}
      {summary && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Payment Methods</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {[
              { label: 'Cash', value: summary.cash_sales, color: C.green },
              { label: 'Card', value: summary.card_sales, color: '#38BDF8' },
            ].map(({ label, value, color }) => {
              const pct = summary.total_revenue > 0 ? (value / summary.total_revenue) * 100 : 0;
              return (
                <div key={label} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>${value.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: color, transition: 'width 300ms' }} />
                  </div>
                  <p style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>{pct.toFixed(0)}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily chart */}
      {daily.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Daily Revenue</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
            {daily.map(d => {
              const h = (d.revenue / maxRev) * 100;
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                  title={`${d.date}: $${d.revenue.toFixed(2)}`}>
                  <div style={{ width: '100%', borderRadius: '3px 3px 0 0', background: C.violet, opacity: 0.8, height: `${Math.max(h, 2)}%` }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 10, color: C.dim }}>{daily[0]?.date}</span>
            <span style={{ fontSize: 10, color: C.dim }}>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Report links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {REPORT_LINKS.map(r => (
          <Link key={r.href} href={r.href}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', textDecoration: 'none', display: 'block', transition: 'border-color 150ms' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{r.label}</p>
            <p style={{ fontSize: 11, color: C.muted }}>{r.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
