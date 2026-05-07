'use client';
import { useState, useEffect, useCallback } from 'react';
import ReportHeader from '@/components/reports/ReportHeader';
import ReportTable, { Column } from '@/components/reports/ReportTable';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import DateRangePicker, { DateRange } from '@/components/reports/DateRangePicker';
import ExportButtons from '@/components/reports/ExportButtons';
import { fmtAUD } from '@/lib/recharts-theme';
import { track } from '@/lib/analytics';

interface Closure extends Record<string, unknown> {
  id: string; outlet_id: string; register_id: string | null;
  opened_at: string; closed_at: string | null;
  opened_by: string | null; closed_by: string | null;
  open_float_cents: number; expected_cash_cents: number; counted_cash_cents: number;
  card_total_cents: number; eftpos_total_cents: number; total_sales_cents: number;
  variance_cents: number;
}

function centsToAUD(c: number) { return fmtAUD(c / 100); }
function fmtDateShort(d: string) { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }

export default function ClosuresReportPage() {
  const [range, setRange] = useState<DateRange>({ from: new Date(Date.now() - 29 * 86400000), to: new Date(), preset: 'This Month' });
  const [rows, setRows] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const from = range.from.toISOString().split('T')[0];
    const to = range.to.toISOString().split('T')[0];
    fetch(`/api/pos/reports/closures?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.closures ?? []);
        setInsight(d.insight?.bullets ?? null);
        setLoading(false);
        track('report_viewed', { type: 'closures' });
      })
      .catch(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const columns: Column[] = [
    { key: 'opened_at', label: 'DATE', sortable: true, format: (v) => fmtDateShort(v as string) },
    { key: 'outlet_id', label: 'OUTLET', format: (v) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{String(v ?? '—').slice(0, 8)}</span> },
    { key: 'opened_by', label: 'OPENED BY', format: (v) => String(v ?? '—') },
    { key: 'closed_by', label: 'CLOSED BY', format: (v) => String(v ?? '—') },
    { key: 'open_float_cents', label: 'OPEN FLOAT', align: 'right', format: (v) => centsToAUD(v as number) },
    { key: 'expected_cash_cents', label: 'EXPECTED', align: 'right', format: (v) => centsToAUD(v as number) },
    { key: 'counted_cash_cents', label: 'COUNTED', align: 'right', format: (v) => centsToAUD(v as number) },
    { key: 'variance_cents', label: 'VARIANCE', align: 'right', sortable: true, format: (v) => {
      const n = v as number;
      const color = n > 500 ? '#F87171' : n < -500 ? '#FBBF24' : '#34D399';
      return <span style={{ color, fontWeight: 700 }}>{n >= 0 ? '+' : ''}{centsToAUD(n)}</span>;
    }},
    { key: 'card_total_cents', label: 'CARD', align: 'right', format: (v) => centsToAUD(v as number) },
    { key: 'total_sales_cents', label: 'TOTAL SALES', align: 'right', sortable: true, format: (v) => <span style={{ fontWeight: 700 }}>{centsToAUD(v as number)}</span> },
  ];

  const selected = rows.find(r => r.id === selectedId);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <ReportHeader
        title="Register Closures"
        subtitle="End-of-day sessions, floats, and cash variance"
        filters={<DateRangePicker value={range} onChange={setRange} />}
        actions={<ExportButtons data={rows} reportType="closures" />}
      />
      <div style={{ padding: '0 24px 24px' }}>
        <AriaInsightCard bullets={insight ?? undefined} loading={loading} />
        <ReportTable
          columns={columns}
          rows={rows}
          loading={loading}
          onRowClick={(row) => setSelectedId((row as unknown as Closure).id)}
          emptyIcon="🔒"
          emptyMessage="No closure records found."
        />
      </div>

      {/* Closure detail drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedId(null)} />
          <div style={{ width: 420, background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-lg)', padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Closure Detail</span>
              <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Opened', fmtDateShort(selected.opened_at)],
                ['Closed', selected.closed_at ? fmtDateShort(selected.closed_at) : 'Open'],
                ['Open Float', centsToAUD(selected.open_float_cents)],
                ['Expected Cash', centsToAUD(selected.expected_cash_cents)],
                ['Counted Cash', centsToAUD(selected.counted_cash_cents)],
                ['Variance', `${selected.variance_cents >= 0 ? '+' : ''}${centsToAUD(selected.variance_cents)}`],
                ['Card Total', centsToAUD(selected.card_total_cents)],
                ['EFTPOS Total', centsToAUD(selected.eftpos_total_cents)],
                ['Total Sales', centsToAUD(selected.total_sales_cents)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: label === 'Variance' ? (selected.variance_cents > 500 ? '#F87171' : selected.variance_cents < -500 ? '#FBBF24' : '#34D399') : 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
