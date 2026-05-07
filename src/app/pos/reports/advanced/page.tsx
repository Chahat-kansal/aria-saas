'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import ReportHeader from '@/components/reports/ReportHeader';
import ReportTable, { Column } from '@/components/reports/ReportTable';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import DateRangePicker, { DateRange } from '@/components/reports/DateRangePicker';
import ExportButtons from '@/components/reports/ExportButtons';
import { fmtAUD, fmtCount, fmtPct } from '@/lib/recharts-theme';
import { track } from '@/lib/analytics';

const REPORT_TYPES = {
  General: ['Outlet','Register','Product','User','User Role','Customer','Customer Group'],
  Classifications: ['Brand','Category','Family','Tag'],
  Stock: ['Supplier'],
  Promotions: ['Promotion','Promotion Category'],
  Payments: ['Payment Method','Payment Method Type'],
  Misc: ['Tax Rate'],
};
const GROUP_BY_OPTIONS = ['None', 'Outlet', 'Category', 'Brand', 'Month', 'Week'];
const AVAILABLE_COLUMNS = ['name','sku','category','revenue','cogs','transaction_count','avg_sale','profit','profit_pct','discount_amount','revenue_pct','items_sold'];

const iS: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' };
const tBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: active ? 'var(--violet)' : 'var(--border-default)', background: active ? 'var(--violet-dim)' : 'var(--bg-elevated)', color: active ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

export default function AdvancedReportPage() {
  const [range, setRange] = useState<DateRange>({ from: new Date(Date.now() - 29 * 86400000), to: new Date(), preset: 'This Month' });
  const [reportType, setReportType] = useState('Product');
  const [groupBy, setGroupBy] = useState('None');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [selectedCols, setSelectedCols] = useState(new Set(['name','revenue','cogs','transaction_count','avg_sale','profit','profit_pct','items_sold']));
  const [showTypePanel, setShowTypePanel] = useState(false);
  const [showColsModal, setShowColsModal] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [sql, setSql] = useState('');
  const [insight, setInsight] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const from = range.from.toISOString().split('T')[0];
    const to = range.to.toISOString().split('T')[0];
    const qs = new URLSearchParams({ from, to, report_type: reportType, group_by: groupBy, include_deleted: includeDeleted ? '1' : '0' });
    fetch(`/api/pos/reports/advanced?${qs}`)
      .then(r => r.json())
      .then(d => {
        setData(d.data ?? []);
        setSql(d.sql ?? '');
        setInsight(d.insight?.bullets ?? null);
        setLoading(false);
        track('advanced_report_built', { report_type: reportType, group_by: groupBy, columns_count: selectedCols.size });
      })
      .catch(() => setLoading(false));
  }, [range, reportType, groupBy, includeDeleted, selectedCols.size]);

  useEffect(() => { load(); }, [load]);

  const COL_FORMATS: Record<string, (v: unknown) => React.ReactNode> = {
    revenue: (v) => fmtAUD(v as number),
    cogs: (v) => fmtAUD(v as number),
    avg_sale: (v) => fmtAUD(v as number),
    profit: (v) => <span style={{ color: (v as number) >= 0 ? '#34D399' : '#F87171', fontWeight: 700 }}>{fmtAUD(v as number)}</span>,
    profit_pct: (v) => <span style={{ color: (v as number) >= 0 ? '#34D399' : '#F87171' }}>{fmtPct(v as number)}</span>,
    transaction_count: (v) => fmtCount(v as number),
    items_sold: (v) => fmtCount(v as number),
    discount_amount: (v) => fmtAUD(v as number),
    revenue_pct: (v) => fmtPct(v as number),
  };

  const COL_LABELS: Record<string, string> = {
    name: 'NAME', sku: 'SKU', category: 'CATEGORY', revenue: 'REVENUE', cogs: 'COST OF GOODS',
    transaction_count: 'TXN COUNT', avg_sale: 'AVG SALE', profit: 'PROFIT', profit_pct: 'PROFIT %',
    discount_amount: 'DISCOUNT', revenue_pct: 'REVENUE %', items_sold: 'ITEMS SOLD',
  };

  const columns: Column[] = AVAILABLE_COLUMNS
    .filter(c => selectedCols.has(c))
    .map(c => ({
      key: c,
      label: COL_LABELS[c] ?? c.toUpperCase(),
      sortable: true,
      align: (['name','sku','category'].includes(c) ? 'left' : 'right') as 'left' | 'right',
      format: COL_FORMATS[c],
    }));

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      {/* SQL Preview bar */}
      <div style={{ background: 'var(--bg-surface)', padding: '8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--divider)' }}>
        <code style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 80px)' }}>{sql || 'Run a report to see the generated SQL'}</code>
        <button onClick={() => setShowSqlModal(true)} style={{ ...tBtn(false), marginLeft: 12, flexShrink: 0, fontSize: 11 }}>Edit</button>
      </div>

      <ReportHeader
        title="Advanced Reports"
        subtitle="Custom report builder — group, filter, export anything"
        filters={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <button style={tBtn(showTypePanel)} onClick={() => setShowTypePanel(v => !v)}>Report Type: {reportType} ▼</button>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={iS}>
              {GROUP_BY_OPTIONS.map(g => <option key={g} value={g}>{g === 'None' ? 'Group By: None' : `Group By: ${g}`}</option>)}
            </select>
            <DateRangePicker value={range} onChange={setRange} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />
              Include Deleted
            </label>
          </div>
        }
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            <ExportButtons data={data} reportType="advanced" />
            <button style={tBtn(false)} onClick={() => setShowColsModal(true)}>⊞ Columns</button>
          </div>
        }
      />

      {/* Report Type panel */}
      {showTypePanel && (
        <div style={{ position: 'fixed', top: 0, left: 240, bottom: 0, width: 280, background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-lg)', zIndex: 30, padding: 20, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Report Type</span>
            <button onClick={() => setShowTypePanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
          {Object.entries(REPORT_TYPES).map(([group, types]) => (
            <div key={group} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{group}</div>
              {types.map(t => (
                <div key={t} onClick={() => { setReportType(t); setShowTypePanel(false); }} style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: reportType === t ? 'var(--violet)' : 'var(--text-primary)', background: reportType === t ? 'var(--violet-dim)' : 'transparent', fontWeight: reportType === t ? 700 : 400, marginBottom: 2 }}>
                  {t}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '0 24px 24px' }}>
        <AriaInsightCard bullets={insight ?? undefined} loading={loading} />
        <ReportTable
          columns={columns}
          rows={data}
          loading={loading}
          groupBy={groupBy !== 'None' ? groupBy.toLowerCase() : undefined}
          emptyIcon="🎯"
          emptyMessage="Select a report type and run."
        />
      </div>

      {/* Columns modal */}
      {showColsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 24, width: 360, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Visible Columns</span>
              <button onClick={() => setShowColsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AVAILABLE_COLUMNS.map(c => (
                <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={selectedCols.has(c)} onChange={e => {
                    setSelectedCols(prev => { const n = new Set(prev); e.target.checked ? n.add(c) : n.delete(c); return n; });
                  }} />
                  {COL_LABELS[c] ?? c}
                </label>
              ))}
            </div>
            <button onClick={() => setShowColsModal(false)} style={{ ...tBtn(true), marginTop: 16, width: '100%', padding: '8px', background: 'var(--violet)', color: '#fff', borderColor: 'var(--violet)' }}>Done</button>
          </div>
        </div>
      )}

      {/* SQL modal (read-only + copy) */}
      {showSqlModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowSqlModal(false); }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 24, width: 640, maxWidth: '92vw', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Generated SQL</span>
              <button onClick={() => setShowSqlModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <pre style={{ background: 'var(--bg-base)', borderRadius: 10, padding: '14px 16px', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-primary)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border-default)' }}>
              {sql || 'No SQL generated yet — run a report first.'}
            </pre>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, marginBottom: 14 }}>SQL editing coming in Phase 2.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(sql).then(() => {
                    setSqlCopied(true);
                    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                    copyTimeoutRef.current = setTimeout(() => setSqlCopied(false), 2000);
                  }).catch(() => {});
                }}
                style={{ ...tBtn(sqlCopied), padding: '7px 16px', background: sqlCopied ? 'rgba(52,211,153,0.14)' : 'var(--bg-overlay)', borderColor: sqlCopied ? '#34D399' : 'var(--border-default)', color: sqlCopied ? '#34D399' : 'var(--text-secondary)' }}
              >
                {sqlCopied ? 'Copied ✓' : '📋 Copy'}
              </button>
              <button onClick={() => setShowSqlModal(false)} style={{ ...tBtn(false) }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
