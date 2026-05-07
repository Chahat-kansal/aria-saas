'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import ReportHeader from '@/components/reports/ReportHeader';
import AriaInsightCard from '@/components/reports/AriaInsightCard';
import DateRangePicker, { DateRange } from '@/components/reports/DateRangePicker';
import ExportButtons from '@/components/reports/ExportButtons';
import { track } from '@/lib/analytics';

const ACTION_TYPES = ['void','refund','no_sale_open','price_override','discount_apply','age_verify','training_mode_on','manager_approval','login','logout','customer_lookup','product_lookup','settings_change'];

interface ActionRow extends Record<string, unknown> {
  id: string; created_at: string; user_id: string; outlet_id: string;
  action_type: string; details: unknown; reason: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  void: '#F87171', refund: '#FBBF24', no_sale_open: '#F59E0B',
  price_override: '#A78BFA', discount_apply: '#60A5FA', age_verify: '#34D399',
  manager_approval: '#EC4899', login: '#94A3B8', logout: '#94A3B8',
  training_mode_on: '#06B6D4', settings_change: '#EF4444',
};

const iS: React.CSSProperties = { background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' };

export default function ActionsReportPage() {
  const [range, setRange] = useState<DateRange>({ from: new Date(Date.now() - 6 * 86400000), to: new Date(), preset: 'This Week' });
  const [actionType, setActionType] = useState('');
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [insight, setInsight] = useState<string[] | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);

  const load = useCallback((pg = 1, append = false) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true);
    const from = range.from.toISOString().split('T')[0];
    const to = range.to.toISOString().split('T')[0];
    const qs = new URLSearchParams({ from, to, page: String(pg) });
    if (actionType) qs.set('action_type', actionType);
    fetch(`/api/pos/reports/actions?${qs}`)
      .then(r => r.json())
      .then(d => {
        setRows(prev => append ? [...prev, ...(d.actions ?? [])] : (d.actions ?? []));
        setTotal(d.total ?? 0);
        setInsight(d.insight?.bullets ?? null);
        setPage(pg);
        setLoading(false);
        setLoadingMore(false);
        if (pg === 1) track('report_viewed', { type: 'actions' });
      })
      .catch(() => { setLoading(false); setLoadingMore(false); });
  }, [range, actionType]);

  useEffect(() => { load(1); }, [load]);

  // Infinite scroll
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingMore && rows.length < total) {
        load(page + 1, true);
      }
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rows.length, total, page, loadingMore, load]);

  function fmtDate(d: string) { return new Date(d).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <ReportHeader
        title="Actions"
        subtitle="Full audit log — every override, void, and session event"
        filters={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <DateRangePicker value={range} onChange={setRange} />
            <select value={actionType} onChange={e => { setActionType(e.target.value); track('report_filter_changed', { type: 'actions', filter: 'action_type', value: e.target.value }); }} style={{ ...iS, width: 180 }}>
              <option value="">All Action Types</option>
              {ACTION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        }
        actions={<ExportButtons data={rows} reportType="actions" />}
      />
      <div style={{ padding: '0 24px 24px' }}>
        <AriaInsightCard bullets={insight ?? undefined} loading={loading} />

        {/* Log table */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['TIMESTAMP','USER','ACTION','DETAILS','REASON'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', background: '#29b6f6', color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                    {[1,2,3,4,5].map(j => (
                      <td key={j} style={{ padding: '10px 14px' }}>
                        <div style={{ height: 12, borderRadius: 4, background: 'var(--bg-overlay)', width: `${40 + Math.random() * 50}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No actions found for this period.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-primary)' }}>{r.user_id ? r.user_id.slice(0, 8) : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: (ACTION_COLORS[r.action_type] ?? '#94A3B8') + '22', color: ACTION_COLORS[r.action_type] ?? '#94A3B8', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                      {r.action_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.details ? JSON.stringify(r.details).slice(0, 80) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{r.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={loaderRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loadingMore && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading more…</span>}
          {!loading && rows.length >= total && total > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{total} records total</span>
          )}
        </div>
      </div>
    </div>
  );
}
