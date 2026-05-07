'use client';
import { useState, useEffect, useCallback } from 'react';
import ReportHeader from '@/components/reports/ReportHeader';
import ReportTable, { Column } from '@/components/reports/ReportTable';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import ExportButtons from '@/components/reports/ExportButtons';
import { fmtAUD } from '@/lib/recharts-theme';
import { track } from '@/lib/analytics';

interface InventoryRow extends Record<string, unknown> {
  id: string; name: string; sku: string; category: string;
  stock_quantity: number; avg_daily: number; days_of_stock: number | null;
  status: string; value_cost: number; value_retail: number;
  low_stock_threshold: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'rgba(239,68,68,0.14)', text: '#F87171', label: '<3 days' },
  low: { bg: 'rgba(245,158,11,0.14)', text: '#FBBF24', label: '3-7 days' },
  ok: { bg: 'rgba(52,211,153,0.14)', text: '#34D399', label: '>7 days' },
  dead: { bg: 'rgba(148,163,184,0.14)', text: '#94A3B8', label: 'Dead Stock' },
  unknown: { bg: 'rgba(148,163,184,0.10)', text: '#94A3B8', label: '—' },
};

const iS: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' };
const tBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: active ? 'var(--violet)' : 'var(--border-default)', background: active ? 'var(--violet-dim)' : 'var(--bg-elevated)', color: active ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

export default function InventoryReportPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [deadStockOnly, setDeadStockOnly] = useState(false);
  const [insight, setInsight] = useState<string[] | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ low_stock: lowStockOnly ? '1' : '0', dead_stock: deadStockOnly ? '1' : '0', search });
    fetch(`/api/pos/reports/inventory?${qs}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.inventory ?? []);
        setInsight(d.insight?.bullets ?? null);
        setLoading(false);
        track('report_viewed', { type: 'inventory', low_stock: lowStockOnly, dead_stock: deadStockOnly });
      })
      .catch(() => setLoading(false));
  }, [search, lowStockOnly, deadStockOnly]);

  useEffect(() => { load(); }, [load]);

  const columns: Column[] = [
    { key: 'name', label: 'PRODUCT', sortable: true, format: (v) => <span style={{ fontWeight: 600 }}>{String(v)}</span> },
    { key: 'sku', label: 'SKU', format: (v) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{v ? String(v) : '—'}</span> },
    { key: 'category', label: 'CATEGORY' },
    { key: 'stock_quantity', label: 'ON HAND', align: 'right', sortable: true },
    { key: 'avg_daily', label: 'AVG/DAY', align: 'right', sortable: true, format: (v) => String((v as number).toFixed(1)) },
    { key: 'days_of_stock', label: 'DAYS LEFT', align: 'right', sortable: true, format: (v, row) => (row.status === 'dead' ? <span style={{ color: '#94A3B8', fontSize: 11 }}>Dead Stock</span> : v == null ? '—' : String(Math.round(v as number))) },
    { key: 'status', label: 'STATUS', format: (v) => {
      const st = STATUS_COLORS[v as string] ?? STATUS_COLORS.unknown;
      return <span style={{ background: st.bg, color: st.text, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{st.label}</span>;
    }},
    { key: 'value_cost', label: 'VALUE@COST', align: 'right', sortable: true, format: (v) => fmtAUD(v as number) },
    { key: 'value_retail', label: 'VALUE@RETAIL', align: 'right', sortable: true, format: (v) => fmtAUD(v as number) },
  ];

  const exportData = rows.map(r => ({ ...r, status: STATUS_COLORS[r.status]?.label ?? r.status }));

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <ReportHeader
        title="Inventory"
        subtitle="Stock levels, velocity, and value"
        filters={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" style={{ ...iS, width: 200 }} />
            <button style={tBtn(lowStockOnly)} onClick={() => setLowStockOnly(v => !v)}>Low Stock Only</button>
            <button style={tBtn(deadStockOnly)} onClick={() => setDeadStockOnly(v => !v)}>Dead Stock Only</button>
          </div>
        }
        actions={<ExportButtons data={exportData} reportType="inventory" />}
      />
      <div style={{ padding: '0 24px 24px' }}>
        <AriaInsightCard bullets={insight ?? undefined} loading={loading} />
        <ReportTable columns={columns} rows={rows} loading={loading} emptyIcon="📦" emptyMessage="No inventory data found." />
      </div>
    </div>
  );
}
