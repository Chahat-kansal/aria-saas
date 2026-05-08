'use client';
import { useState, useEffect, useCallback } from 'react';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import ExportButtons from '@/components/reports/ExportButtons';
import { track } from '@/lib/analytics';

interface DeadRow {
  id: string; name: string; sku: string; outlet_name: string; stock_quantity: number;
  value_cost: number; value_retail: number; last_sold: string | null; days_since: number;
  suggested_action: string;
}

const DAYS_OPTIONS = [30, 60, 90, 180] as const;
const ACTION_COLORS: Record<string, string> = {
  'Clearance 50% off': '#34D399', 'Return to supplier': '#60A5FA',
  'Bundle promo': '#A78BFA', 'Dispose': '#F87171', 'Investigate': '#FBBF24',
};

const iS: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' };
const tBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: active ? 'var(--violet)' : 'var(--border-default)', background: active ? 'var(--violet-dim)' : 'var(--bg-elevated)', color: active ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

export default function DeadStockPage() {
  const [rows, setRows] = useState<DeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string[] | null>(null);
  const [daysSince, setDaysSince] = useState<number>(60);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/pos/dead-stock?days=${daysSince}`).then(r => r.json()).then(d => {
      setRows(d.items ?? []);
      setInsight(d.insight?.bullets ?? null);
      setLoading(false);
      track('report_viewed', { type: 'dead_stock', days_since: daysSince });
    }).catch(() => setLoading(false));
  }, [daysSince]);

  useEffect(() => { load(); }, [load]);

  function toggleAll() {
    setSelected(s => s.size === rows.length ? new Set() : new Set(rows.map(r => r.id)));
  }

  const totalValue = rows.reduce((s, r) => s + r.value_cost, 0);
  const pct = rows.length;

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dead Stock Detector</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Products with no sales in the selected period</p>
        </div>
        <ExportButtons data={rows} reportType="dead-stock" columns={[
          { key: 'name', label: 'Product' }, { key: 'outlet_name', label: 'Outlet' },
          { key: 'stock_quantity', label: 'On Hand' }, { key: 'value_cost', label: 'Value@Cost' },
          { key: 'days_since', label: 'Days Since' }, { key: 'suggested_action', label: 'Action' },
        ]} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>0 sales in:</span>
        {DAYS_OPTIONS.map(d => (
          <button key={d} style={tBtn(daysSince === d)} onClick={() => setDaysSince(d)}>{d} days</button>
        ))}
      </div>

      <AriaInsightCard bullets={insight ?? undefined} loading={loading} />

      {/* Summary bar */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'Dead Items', value: String(pct), color: '#F87171' },
            { label: 'Value@Cost', value: `A$${totalValue.toFixed(0)}`, color: '#FBBF24' },
            { label: 'Avg Days Dead', value: `${Math.round(rows.reduce((s, r) => s + r.days_since, 0) / rows.length)}d`, color: 'var(--text-secondary)' },
          ].map(m => (
            <div key={m.label} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: m.color, fontFamily: "'JetBrains Mono',monospace" }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 16px', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--violet)' }}>{selected.size} selected</span>
          {['Generate clearance promo', 'Mark for stocktake'].map(action => (
            <button key={action} onClick={() => { alert(`${action} — Phase 2 feature`); }} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{action}</button>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px', background: '#29b6f6', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} />
              </th>
              {['PRODUCT','OUTLET','ON HAND','VALUE@COST','LAST SOLD','DAYS','SUGGESTED ACTION'].map(h => (
                <th key={h} style={{ padding: '10px 14px', background: '#29b6f6', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} style={{ padding: '10px 14px' }}><div style={{ height: 12, background: 'var(--bg-overlay)', borderRadius: 4, width: '70%' }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                No dead stock found for this period.
              </td></tr>
            ) : rows.map((r, i) => {
              const actionColor = ACTION_COLORS[r.suggested_action] ?? '#94A3B8';
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => setSelected(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{r.outlet_name || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>{r.stock_quantity}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#FBBF24', fontFamily: "'JetBrains Mono',monospace" }}>A${r.value_cost.toFixed(2)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{r.last_sold ? new Date(r.last_sold).toLocaleDateString('en-AU') : 'Never'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#F87171' }}>{r.days_since}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: `${actionColor}22`, color: actionColor, fontWeight: 700 }}>{r.suggested_action}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
