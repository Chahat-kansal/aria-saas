'use client';
import { useState, useEffect } from 'react';

const C = { card: 'var(--bg-surface)', border: 'rgba(0,229,255,0.08)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', cyan: '#00E5FF', green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6' };

const ACTION_COLOR: Record<string, string> = {
  view_business: C.dim, edit_business: '#3B82F6', disable_account: C.amber, enable_account: C.green,
  set_plan: '#3B82F6', impersonate: C.violet, send_email: C.green,
  delete_data: C.red, change_feature_flag: C.cyan, run_cron: C.cyan, create_announcement: C.green,
  update_ticket: '#3B82F6',
};

export default function AuditPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (filterAction) params.set('action', filterAction);
    fetch(`/api/admin/audit?${params}`).then(r => r.json()).then(d => {
      setEntries(d.entries || []); setTotal(d.total || 0); setLoading(false);
    }).catch(() => setLoading(false));
  }, [page, filterAction]);

  const iS = { background: 'var(--bg-base)', border: `1px solid rgba(0,229,255,0.12)`, borderRadius: 8, padding: '6px 10px', fontSize: 12, color: C.text, outline: 'none', fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 2 }}>Audit Log</h1>
          <p style={{ fontSize: 13, color: C.muted }}>{total.toLocaleString()} total entries</p>
        </div>
        <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1); }} style={iS}>
          <option value="">All actions</option>
          {Object.keys(ACTION_COLOR).map(a => <option key={a} value={a}>{a.replace(/_/g,' ')}</option>)}
        </select>
      </div>

      {loading ? <p style={{ color: C.muted }}>Loading…</p> : (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                    {['Time','Admin','Role','Action','Target','Details'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 12px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id} style={{ borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding: '9px 12px', color: C.dim, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{e.created_at ? new Date(e.created_at).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                      <td style={{ padding: '9px 12px', color: C.muted, fontSize: 11 }}>{e.admin_email}</td>
                      <td style={{ padding: '9px 12px', color: C.dim, fontSize: 10, textTransform: 'capitalize' }}>{e.admin_role || '—'}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: `${ACTION_COLOR[e.action] || C.muted}12`, color: ACTION_COLOR[e.action] || C.muted, fontFamily: 'monospace' }}>
                          {e.action}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', color: C.muted, fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.target_type && <span style={{ color: C.dim, marginRight: 4 }}>{e.target_type}:</span>}
                        {e.target_name || e.target_id?.slice(0, 8) || '—'}
                      </td>
                      <td style={{ padding: '9px 12px', color: C.dim, fontFamily: 'monospace', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.details ? JSON.stringify(e.details).slice(0, 80) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>
              ← Prev
            </button>
            <span style={{ padding: '6px 14px', fontSize: 12, color: C.muted }}>Page {page} of {Math.ceil(total/50)}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total/50)}
              style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, opacity: page >= Math.ceil(total/50) ? 0.4 : 1 }}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
