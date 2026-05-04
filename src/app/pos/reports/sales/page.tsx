'use client';
import { useState, useEffect } from 'react';

interface Sale {
  id: string; sale_number?: string; total_amount: number; tax_amount?: number;
  payment_method?: string; status?: string; created_at: string;
  served_by?: string | null; customer_id?: string | null;
}
interface DayRevenue { date: string; revenue: number; }

const C = {
  bg:      'rgba(17,15,26,0.95)',
  card:    'rgba(26,23,40,0.9)',
  border:  '#2A2540',
  text:    '#EDE8FF',
  muted:   '#8B85A8',
  dim:     '#4A4565',
  violet:  '#8B5CF6',
};

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }

export default function SalesReportPage() {
  const [sales, setSales]     = useState<Sale[]>([]);
  const [chart, setChart]     = useState<DayRevenue[]>([]);
  const [summary, setSummary] = useState({ total: 0, count: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
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
    setLoading(true); setError(null);
    fetch(`/api/pos/reports/sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setSales(d.sales ?? []);
        setChart(d.revenue_by_day ?? []);
        const total = (d.total_revenue_cents ?? 0) / 100;
        const count = d.transaction_count ?? 0;
        setSummary({ total, count, avg: count > 0 ? total / count : 0 });
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [from, to]);

  const maxRev = Math.max(...chart.map(d => d.revenue), 0.01);

  const PAY_COLOR: Record<string, string> = {
    card: '#3B82F6', cash: '#22C55E', eftpos: '#38BDF8', split: '#F59E0B',
  };

  function exportCSV() {
    const rows = [['Sale #','Date','Cashier','Payment','Tax','Total','Status'].join(',')];
    sales.forEach(s => rows.push([
      s.sale_number ?? s.id.slice(-8), new Date(s.created_at).toLocaleDateString('en-AU'),
      s.served_by ?? '', s.payment_method ?? '', `$${(s.tax_amount ?? 0).toFixed(2)}`,
      `$${s.total_amount.toFixed(2)}`, s.status ?? '',
    ].join(',')));
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    a.download = `sales-${from}-${to}.csv`; a.click();
  }

  const btnCls = (active: boolean) =>
    `text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${active
      ? 'bg-violet-600 border-violet-600 text-white'
      : 'border-[#2A2540] text-[#8B85A8] hover:border-[#8B5CF6] hover:text-[#EDE8FF]'}`;

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '24px 24px 32px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Sales Report</h1>
            <p style={{ fontSize: 12, color: C.muted }}>
              {loading ? 'Loading…' : `${summary.count} transaction${summary.count !== 1 ? 's' : ''} · A$${summary.total.toFixed(2)} total`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(['7','30','90'] as const).map(d => (
              <button key={d} onClick={() => setRange(d)} className={btnCls(range === d)}>
                {d === '7' ? 'Week' : d === '30' ? 'Month' : '90 days'}
              </button>
            ))}
            <button onClick={() => setRange('custom')} className={btnCls(range === 'custom')}>Custom</button>
            {range === 'custom' && (
              <>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
                <span style={{ color: C.dim, fontSize: 12 }}>to</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
              </>
            )}
            <button onClick={exportCSV}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Export CSV
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#EF4444', fontSize: 13 }}>
            ⚠ API error: {error}
          </div>
        )}

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Revenue',   value: `A$${summary.total.toFixed(2)}` },
            { label: 'Transactions',    value: summary.count.toString() },
            { label: 'Average Basket',  value: `A$${summary.avg.toFixed(2)}` },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.dim, marginBottom: 8 }}>{s.label}</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        {chart.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.dim, marginBottom: 12 }}>Revenue by day</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 96, overflowX: 'auto', paddingBottom: 8 }}>
              {chart.map(d => (
                <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, minWidth: 28 }}>
                  <div title={`${d.date}: A$${d.revenue.toFixed(2)}`}
                    style={{ width: 20, borderRadius: '4px 4px 0 0', background: C.violet, opacity: 0.85, transition: 'height 300ms', height: `${Math.max(4, (d.revenue / maxRev) * 80)}px` }} />
                  <span style={{ fontSize: 8, color: C.dim, transform: 'rotate(45deg)', transformOrigin: 'left', whiteSpace: 'nowrap' }}>{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Sale #','Date/Time','Cashier','Payment','Tax (GST)','Total','Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '12px 16px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: C.dim, fontSize: 13 }}>Loading…</td></tr>
              ) : !sales.length ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 64, color: C.dim, fontSize: 13 }}>
                  No sales in this period
                  <br/><span style={{ fontSize: 11, color: C.dim, opacity: 0.6 }}>Make a sale in the terminal to see it here</span>
                </td></tr>
              ) : sales.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: i < sales.length - 1 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: C.violet }}>
                    {s.sale_number ?? s.id.slice(-8).toUpperCase()}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: C.muted }}>
                    {new Date(s.created_at).toLocaleDateString('en-AU')}<br/>
                    <span style={{ fontSize: 10, color: C.dim }}>{new Date(s.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: C.muted }}>{(s as any).served_by ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, textTransform: 'capitalize', background: `${PAY_COLOR[s.payment_method ?? 'card'] ?? C.violet}22`, color: PAY_COLOR[s.payment_method ?? 'card'] ?? C.violet }}>
                      {s.payment_method ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: C.muted }}>A${(s.tax_amount ?? 0).toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: C.text }}>A${s.total_amount.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: s.status === 'completed' ? 'rgba(139,92,246,0.15)' : s.status === 'refunded' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: s.status === 'completed' ? C.violet : s.status === 'refunded' ? '#EF4444' : C.muted }}>
                      {s.status ?? 'completed'}
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
