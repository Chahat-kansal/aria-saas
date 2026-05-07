'use client';
import { useState, useEffect } from 'react';

interface CashierRow { name: string; sales_count: number; revenue: number; cash_sales: number; card_sales: number; refunds: number; avg_basket: number; }

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#8B5CF6' };
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
      .then(d => { setRows(d.by_cashier ?? []); setTotals(d.totals ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [from, to]);

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '24px 24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Cashier Report</h1>
            <p style={{ fontSize: 12, color: C.muted }}>Sales performance by staff member</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
            <span style={{ color: C.dim, fontSize: 12 }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Revenue',   value: `A$${(totals?.total_revenue ?? 0).toFixed(2)}` },
            { label: 'Total Sales',     value: String(totals?.total_sales ?? 0) },
            { label: 'Active Cashiers', value: String(totals?.cashier_count ?? 0) },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.dim, marginBottom: 8 }}>{s.label}</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: C.text }}>{s.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 48, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 64, textAlign: 'center' }}>
            <p style={{ color: C.muted, fontSize: 14 }}>No cashier data for this period.</p>
            <p style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>Fill in the &ldquo;Sale by&rdquo; field on the terminal to track cashier performance.</p>
          </div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 120px 100px 100px 90px 100px', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
              {['Cashier','Sales','Revenue','Cash','Card','Refunds','Avg Basket'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, textAlign: h === 'Cashier' ? 'left' : 'right' }}>{h}</span>
              ))}
            </div>
            {rows.map((row, i) => (
              <div key={row.name} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 120px 100px 100px 90px 100px', padding: '12px 16px', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', border: `1px solid rgba(139,92,246,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: C.violet, flexShrink: 0 }}>
                    {row.name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{row.name}</span>
                </div>
                <span style={{ textAlign: 'right', color: C.muted, fontSize: 13 }}>{row.sales_count}</span>
                <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.text, fontSize: 13 }}>A${row.revenue.toFixed(2)}</span>
                <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: C.muted, fontSize: 12 }}>A${row.cash_sales.toFixed(2)}</span>
                <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: C.muted, fontSize: 12 }}>A${row.card_sales.toFixed(2)}</span>
                <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: row.refunds > 0 ? '#EF4444' : C.dim, fontSize: 12 }}>{row.refunds > 0 ? `A$${row.refunds.toFixed(2)}` : '—'}</span>
                <span style={{ textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: C.muted, fontSize: 12 }}>A${row.avg_basket.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
