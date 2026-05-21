'use client';
import { useState, useEffect, useCallback } from 'react';

interface ActivityRow {
  id: string;
  agent_type: string;
  business_id: string;
  decision_data: Record<string, unknown>;
  status: string;
  projected_impact_cents: number;
  confidence_score: number;
  created_at: string;
  reviewed_at: string | null;
  reasoning: string;
}

const AGENT_TYPES = ['all', 'reorder', 'pricing', 'schedule'];
const STATUS_COLORS: Record<string, string> = {
  approved: '#00B140', rejected: '#F87171', snoozed: '#FBBF24', auto_executed: '#60A5FA',
};
const agentColor: Record<string, string> = { reorder: '#00B140', pricing: '#FBBF24', schedule: '#60A5FA' };

const relTime = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
const impactFmt = (cents: number) => cents >= 0 ? `+A$${(cents / 100).toFixed(0)}` : `-A$${(Math.abs(cents) / 100).toFixed(0)}`;

function decisionSummary(row: ActivityRow): string {
  const d = row.decision_data;
  return (d?.supplier_name as string) ?? (d?.product_name as string) ?? (d?.outlet_name as string) ?? '—';
}

export default function AgentActivityPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => { document.title = 'Agent Activity | Aria POS'; }, [])
  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ status: 'reviewed', limit: '100' });
    if (agentFilter !== 'all') params.set('agent_type', agentFilter);
    fetch(`/api/pos/agents/all?${params}`).then(r => r.json()).then(d => {
      const all: ActivityRow[] = (d.decisions ?? []).filter((r: ActivityRow) =>
        ['approved', 'rejected', 'snoozed', 'auto_executed'].includes(r.status)
      );
      all.sort((a, b) => new Date(b.reviewed_at ?? b.created_at).getTime() - new Date(a.reviewed_at ?? a.created_at).getTime());
      setRows(all);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agentFilter]);

  useEffect(() => { load(); setPage(0); }, [load]);

  const filtered = dateFrom
    ? rows.filter(r => new Date(r.reviewed_at ?? r.created_at) >= new Date(dateFrom))
    : rows;
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const iS: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8,
    padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
  };
  const tBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
    borderColor: active ? 'var(--violet)' : 'var(--border-default)',
    background: active ? 'var(--violet-dim)' : 'var(--bg-elevated)',
    color: active ? 'var(--violet)' : 'var(--text-secondary)',
  });

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Agent Activity Log</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Audit trail of all reviewed agent decisions</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        {AGENT_TYPES.map(t => (
          <button key={t} style={tBtn(agentFilter === t)} onClick={() => setAgentFilter(t)}>
            {t === 'all' ? 'All agents' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From:</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} style={iS} />
          {dateFrom && <button onClick={() => setDateFrom('')} style={{ ...iS, cursor: 'pointer', color: 'var(--text-tertiary)' }}>✕</button>}
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['TIMESTAMP', 'AGENT', 'DECISION', 'CONFIDENCE', 'IMPACT', 'STATUS', 'APPROVED BY', 'OUTCOME'].map(h => (
                <th key={h} style={{ padding: '10px 14px', background: '#006AFF', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} style={{ padding: '10px 14px' }}><div style={{ height: 12, background: 'var(--bg-overlay)', borderRadius: 4, width: '70%' }} /></td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No reviewed decisions found for this filter.
              </td></tr>
            ) : paged.map((r, i) => {
              const statusColor = STATUS_COLORS[r.status] ?? '#94A3B8';
              const color = agentColor[r.agent_type] ?? '#006AFF';
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    {r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : relTime(r.created_at)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: `${color}22`, color, fontWeight: 700 }}>{r.agent_type}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {decisionSummary(r)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 48, height: 4, borderRadius: 99, background: 'var(--bg-overlay)', overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ height: '100%', width: `${(r.confidence_score ?? 0) * 100}%`, background: (r.confidence_score ?? 0) >= 0.8 ? '#00B140' : (r.confidence_score ?? 0) >= 0.5 ? '#FBBF24' : '#F87171', borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{((r.confidence_score ?? 0) * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: r.projected_impact_cents >= 0 ? '#00B140' : '#FBBF24' }}>
                    {impactFmt(r.projected_impact_cents ?? 0)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: `${statusColor}22`, color: statusColor, fontWeight: 700, textTransform: 'capitalize' }}>{r.status.replace('_', ' ')}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>User</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.reasoning ? r.reasoning.slice(0, 60) + (r.reasoning.length > 60 ? '…' : '') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: page === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12 }}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{page + 1} / {totalPages} · {filtered.length} decisions</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: page >= totalPages - 1 ? 'var(--text-tertiary)' : 'var(--text-primary)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Next →</button>
        </div>
      )}
    </div>
  );
}
