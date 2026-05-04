'use client';
import { useState, useEffect } from 'react';

interface Session { id: string; opened_at: string; closed_at: string | null; opening_float: number | null; closing_float: number | null; total_cash_sales: number | null; total_card_sales: number | null; total_revenue: number | null; transaction_count: number | null; variance: number; duration_mins: number | null; status: string; }

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6' };

export default function RegisterClosuresPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/pos/reports/closures')
      .then(r => r.json())
      .then(d => { setSessions(d.sessions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function exportCSV() {
    const rows = [['Date','Open','Close','Duration','Float','Cash Sales','Card Sales','Closing Float','Variance'].join(',')];
    sessions.forEach(s => rows.push([
      s.opened_at ? new Date(s.opened_at).toLocaleDateString('en-AU') : '',
      s.opened_at ? new Date(s.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      s.closed_at ? new Date(s.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      s.duration_mins ? `${s.duration_mins}min` : '',
      String(s.opening_float ?? 0), String(s.total_cash_sales ?? 0),
      String(s.total_card_sales ?? 0), String(s.closing_float ?? 0), (s.variance ?? 0).toFixed(2),
    ].join(',')));
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    a.download = 'register-closures.csv'; a.click();
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '24px 24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Register Closures</h1>
            <p style={{ fontSize: 12, color: C.muted }}>{sessions.length} closed session{sessions.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={exportCSV} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Export CSV</button>
        </div>

        {loading ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 48, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 64, textAlign: 'center' }}>
            <p style={{ color: C.muted, fontSize: 14 }}>No closed sessions yet.</p>
            <p style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>Sessions appear here after you close the register via Operations → Close Register.</p>
          </div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                  {['Date','Open','Close','Duration','Float','Cash Sales','Card Sales','Closing Float','Variance'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '12px 14px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const v = s.variance ?? 0;
                  return (
                    <tr key={s.id} style={{ borderBottom: i < sessions.length - 1 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: C.text, fontSize: 13 }}>{s.opened_at ? new Date(s.opened_at).toLocaleDateString('en-AU') : '—'}</td>
                      <td style={{ padding: '12px 14px', color: C.muted, fontSize: 12 }}>{s.opened_at ? new Date(s.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td style={{ padding: '12px 14px', color: C.muted, fontSize: 12 }}>{s.closed_at ? new Date(s.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td style={{ padding: '12px 14px', color: C.dim, fontSize: 12 }}>{s.duration_mins ? `${s.duration_mins}m` : '—'}</td>
                      <td style={{ padding: '12px 14px', fontFamily: "'JetBrains Mono',monospace", color: C.muted, fontSize: 12 }}>A${(s.opening_float ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: "'JetBrains Mono',monospace", color: '#22C55E', fontSize: 12 }}>A${(s.total_cash_sales ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: "'JetBrains Mono',monospace", color: '#3B82F6', fontSize: 12 }}>A${(s.total_card_sales ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: "'JetBrains Mono',monospace", color: C.muted, fontSize: 12 }}>A${(s.closing_float ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: Math.abs(v) < 1 ? '#22C55E' : Math.abs(v) < 10 ? '#F59E0B' : '#EF4444' }}>
                          {v >= 0 ? '+' : ''}{v.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
