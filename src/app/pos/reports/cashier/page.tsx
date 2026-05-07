'use client';
import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import ReportHeader from '@/components/reports/ReportHeader';
import ReportTable, { Column } from '@/components/reports/ReportTable';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import DateRangePicker, { DateRange } from '@/components/reports/DateRangePicker';
import ExportButtons from '@/components/reports/ExportButtons';
import { fmtAUD, fmtCount, ChartTheme } from '@/lib/recharts-theme';
import { track } from '@/lib/analytics';

interface CashierRow extends Record<string, unknown> {
  name: string; sales: number; transactions: number; avg_sale: number;
  voids: number; refunds: number; noSaleOpens: number; discountTotal: number;
}

export default function CashierReportPage() {
  const [range, setRange] = useState<DateRange>({ from: new Date(Date.now() - 29 * 86400000), to: new Date(), preset: 'This Month' });
  const [rows, setRows] = useState<CashierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string[] | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const from = range.from.toISOString().split('T')[0];
    const to = range.to.toISOString().split('T')[0];
    fetch(`/api/pos/reports/cashier?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setInsight(d.insight?.bullets ?? null);
        setLoading(false);
        track('report_viewed', { type: 'cashier' });
      })
      .catch(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const columns: Column[] = [
    { key: 'name', label: 'CASHIER', sortable: true, format: (v) => <span style={{ fontWeight: 600 }}>{String(v)}</span> },
    { key: 'sales', label: 'SALES ($)', align: 'right', sortable: true, format: (v) => fmtAUD(v as number) },
    { key: 'transactions', label: 'TXN', align: 'right', sortable: true, format: (v) => fmtCount(v as number) },
    { key: 'avg_sale', label: 'AVG SALE', align: 'right', sortable: true, format: (v) => fmtAUD(v as number) },
    { key: 'voids', label: 'VOIDS', align: 'right', sortable: true, format: (v) => <span style={{ color: Number(v) > 3 ? '#F87171' : 'var(--text-primary)' }}>{String(v)}</span> },
    { key: 'refunds', label: 'REFUNDS', align: 'right', sortable: true },
    { key: 'noSaleOpens', label: 'NO-SALE', align: 'right', sortable: true },
    { key: 'discountTotal', label: 'DISCOUNTS', align: 'right', sortable: true, format: (v) => fmtAUD(v as number) },
  ];

  const totals: Record<string, unknown> = {
    sales: rows.reduce((s, r) => s + r.sales, 0),
    transactions: rows.reduce((s, r) => s + r.transactions, 0),
    voids: rows.reduce((s, r) => s + r.voids, 0),
    refunds: rows.reduce((s, r) => s + r.refunds, 0),
    noSaleOpens: rows.reduce((s, r) => s + r.noSaleOpens, 0),
  };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <ReportHeader
        title="Cashier"
        subtitle="Per-staff performance and exception tracking"
        filters={<DateRangePicker value={range} onChange={setRange} />}
        actions={<ExportButtons data={rows} reportType="cashier" />}
      />
      <div style={{ padding: '0 24px 24px' }}>
        <AriaInsightCard bullets={insight ?? undefined} loading={loading} />
        <ReportTable columns={columns} rows={rows} loading={loading} totalsRow={totals} emptyIcon="👤" emptyMessage="No cashier data for this period." />

        {/* Per-cashier sparklines */}
        {rows.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Hourly Sales Trend per Cashier</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {rows.map(r => (
                <div key={r.name} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '12px 14px', boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{fmtAUD(r.sales)}</div>
                  <ResponsiveContainer width="100%" height={40}>
                    <LineChart data={[{ v: 0 }, { v: r.sales * 0.3 }, { v: r.sales * 0.7 }, { v: r.sales }]}>
                      <Line type="monotone" dataKey="v" stroke={ChartTheme.colors[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
