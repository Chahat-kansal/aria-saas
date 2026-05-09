'use client';
import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReportHeader from '@/components/reports/ReportHeader';
import ReportTable from '@/components/reports/ReportTable';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import MetricCard from '@/components/reports/MetricCard';
import DateRangePicker, { DateRange } from '@/components/reports/DateRangePicker';
import ExportButtons from '@/components/reports/ExportButtons';
import { ChartTheme, fmtAUD, fmtCount } from '@/lib/recharts-theme';
import { track } from '@/lib/analytics';

interface DailyRow extends Record<string, unknown> { date: string; revenue: number; count: number; }
interface Product extends Record<string, unknown> { name: string; revenue: number; quantity: number; }

const iS: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' };
const tBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 14px', borderRadius: 6, border: '1px solid', borderColor: active ? 'var(--violet)' : 'var(--border-default)', background: active ? 'var(--violet-dim)' : 'var(--bg-elevated)', color: active ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

function presetToISO(range: DateRange) {
  return { from: range.from.toISOString().split('T')[0], to: range.to.toISOString().split('T')[0] };
}

function SkeletonLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 24px 24px' }}>
      <div style={{ height: 320, borderRadius: 16, background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 50%, var(--bg-elevated) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{ height: 44, borderRadius: 8, background: 'var(--bg-elevated)', opacity: 1 - i * 0.12, animation: 'shimmer 1.4s infinite', animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div style={{
      height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 8, background: 'var(--bg-elevated)', borderRadius: 16,
      border: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontSize: 32 }}>📊</span>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>No data for this period</p>
    </div>
  );
}

function safeDateTick(val: unknown): string {
  if (val == null || val === '') return '';
  try {
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  } catch {
    return String(val);
  }
}

export default function SalesDashboardPage() {
  const [range, setRange] = useState<DateRange>({ from: new Date(Date.now() - 29 * 86400000), to: new Date(), preset: 'This Month' });
  const [metric, setMetric] = useState<'Revenue' | 'Sale Count'>('Revenue');
  const [period, setPeriod] = useState<'Day' | 'Week' | 'Month' | 'Year'>('Day');
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [count, setCount] = useState(0);
  const [customers, setCustomers] = useState(0);
  const [avgSale, setAvgSale] = useState(0);
  const [topProducts, setTopProducts] = useState<Product[]>([]);
  const [insight, setInsight] = useState<string[] | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Controlled sort state persists across filter changes
  const [sortField, setSortField] = useState<string | null>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(() => {
    const { from, to } = presetToISO(range);
    setLoading(true);
    setInsightLoading(true);
    fetch(`/api/pos/reports/dashboard?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        setRevenue(d.revenue ?? 0);
        setCount(d.count ?? 0);
        setCustomers(d.customers ?? 0);
        setAvgSale(d.avgSale ?? 0);
        setDaily(d.daily ?? []);
        setTopProducts(d.topProducts ?? []);
        setInsight(d.insight?.bullets ?? null);
        setLoading(false);
        setInsightLoading(false);
        track('report_viewed', { type: 'sales', period });
      })
      .catch(() => { setLoading(false); setInsightLoading(false); });
  }, [range, period]);

  useEffect(() => { load(); }, [load]);

  const sparkRev = daily.map(d => d.revenue);
  const sparkCount = daily.map(d => d.count);

  const periodStart = range.from.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  const exportFilename = [
    'report', 'sales',
    range.preset !== 'Custom' ? range.preset.toLowerCase().replace(/\s+/g, '-') : null,
    new Date().toISOString().split('T')[0],
  ].filter(Boolean).join('-');

  const prodCols = [
    { key: 'name', label: 'PRODUCT', sortable: true, format: (v: unknown) => <span style={{ textTransform: 'uppercase', fontWeight: 600, fontSize: 12 }}>{String(v)}</span> },
    { key: 'revenue', label: 'REVENUE', align: 'right' as const, sortable: true, format: (v: unknown) => fmtAUD(v as number) },
    { key: 'quantity', label: 'QTY', align: 'right' as const, sortable: true, format: (v: unknown) => fmtCount(v as number) },
  ];

  const prodTotals = { revenue: topProducts.reduce((s, p) => s + p.revenue, 0), quantity: topProducts.reduce((s, p) => s + p.quantity, 0) };

  const chartDataKey = metric === 'Revenue' ? 'revenue' : 'count';

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <ReportHeader
        title="Sales"
        subtitle="Revenue and transaction analysis"
        filters={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <DateRangePicker value={range} onChange={r => { setRange(r); track('report_filter_changed', { type: 'sales', filter: 'date_range', value: r.preset }); }} />
            <div style={{ display: 'flex', gap: 4 }}>
              {(['Revenue', 'Sale Count'] as const).map(m => (
                <button key={m} style={tBtn(metric === m)} onClick={() => setMetric(m)}>{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['Day', 'Week', 'Month', 'Year'] as const).map(p => (
                <button key={p} style={tBtn(period === p)} onClick={() => setPeriod(p)}>{p}</button>
              ))}
            </div>
          </div>
        }
        actions={<ExportButtons data={topProducts} reportType="sales" columns={[{ key: 'name', label: 'Product' }, { key: 'revenue', label: 'Revenue' }, { key: 'quantity', label: 'Qty' }]} filename={exportFilename} config={{ period: range.preset }} />}
      />

      {loading ? <SkeletonLoader /> : null}
      <div style={{ padding: '0 24px 24px', display: loading ? 'none' : undefined }}>
        <AriaInsightCard bullets={insight ?? undefined} loading={insightLoading} />

        {/* Stacked bar chart */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '20px 16px 12px', marginBottom: 20, boxShadow: 'var(--shadow-card)' }}>
          {daily.length === 0 && !loading ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={daily} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
                <CartesianGrid {...ChartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={ChartTheme.axis.tick}
                  tickLine={ChartTheme.axis.tickLine}
                  axisLine={ChartTheme.axis.axisLine}
                  tickFormatter={safeDateTick}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={ChartTheme.axis.tick}
                  tickLine={ChartTheme.axis.tickLine}
                  axisLine={ChartTheme.axis.axisLine}
                  tickFormatter={v => v == null ? '' : metric === 'Revenue' ? `$${Math.round((v as number) / 1000)}k` : String(v)}
                  width={54}
                />
                <Tooltip
                  contentStyle={ChartTheme.tooltip.contentStyle}
                  labelStyle={ChartTheme.tooltip.labelStyle}
                  itemStyle={ChartTheme.tooltip.itemStyle}
                  cursor={ChartTheme.tooltip.cursor}
                  formatter={(v: unknown) => [
                    v != null ? (metric === 'Revenue' ? fmtAUD(v as number) : fmtCount(v as number)) : '—',
                    metric,
                  ]}
                  labelFormatter={safeDateTick}
                />
                <Legend {...ChartTheme.legend} />
                <Bar dataKey={chartDataKey} name={metric} fill={ChartTheme.colors[1]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 5 metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <MetricCard label="Revenue" value={revenue} format="aud" sparklineData={sparkRev} />
          <MetricCard label="Sale Count" value={count} format="count" sparklineData={sparkCount} />
          <MetricCard label="Customers" value={customers} format="count" />
          <MetricCard label="Average Sale" value={avgSale} format="aud" />
          <MetricCard label="Basket Size" value={count ? revenue / count : 0} format="aud" />
        </div>

        {/* Top 20 products */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>TOP 20 PRODUCTS</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>SINCE {periodStart.toUpperCase()}</span>
          </div>
          <ReportTable
            columns={prodCols}
            rows={topProducts}
            loading={loading}
            totalsRow={prodTotals}
            emptyIcon="📦"
            emptyMessage="No sales data for this period."
            sortField={sortField}
            sortDir={sortDir}
            onSort={(f, d) => { setSortField(f); setSortDir(d); }}
          />
        </div>
      </div>
    </div>
  );
}
