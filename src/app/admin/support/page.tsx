'use client';
import { useState, useEffect } from 'react';

const C = { card: 'var(--bg-surface)', border: 'rgba(0,229,255,0.08)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', cyan: '#00E5FF', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const PRIORITY_COLOR: Record<string,string> = { low: C.muted, normal: C.cyan, high: C.amber, critical: C.red };

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('open');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/support${filter !== 'all' ? `?status=${filter}` : ''}`).then(r => r.json()).then(d => {
      setTickets(d.tickets || []); setLoading(false);
    }).catch(() => setLoading(false));
  }, [filter]);

  async function updateTicket(id: string, updates: object) {
    await fetch(`/api/admin/support?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }

  const iS = { background: 'var(--bg-base)', border: `1px solid rgba(0,229,255,0.12)`, borderRadius: 8, padding: '6px 10px', fontSize: 12, color: C.text, outline: 'none', fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:C.text }}>Support Tickets</h1>
        <div style={{ display:'flex', gap:6 }}>
          {['open','in_progress','resolved','all'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding:'6px 14px', borderRadius:99, border:`1px solid ${filter===s ? C.cyan : C.border}`, background: filter===s ? 'rgba(0,229,255,0.1)' : 'transparent', color: filter===s ? C.cyan : C.muted, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>
              {s.replace('_',' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p style={{ color:C.muted }}>Loading…</p> : !tickets.length ? (
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'40px', textAlign:'center', color:C.dim }}>
          <p style={{ fontSize:32, marginBottom:8 }}>🎧</p>
          <p>No {filter} tickets</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {tickets.map(ticket => (
            <div key={ticket.id} style={{ background:C.card, border:`1px solid ${expanded===ticket.id ? 'rgba(0,229,255,0.2)' : C.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', cursor:'pointer' }} onClick={() => setExpanded(expanded===ticket.id ? null : ticket.id)}>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:2 }}>{ticket.subject}</p>
                  <p style={{ fontSize:11, color:C.muted }}>{ticket.user_email} · {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-AU') : '—'}</p>
                </div>
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:`${PRIORITY_COLOR[ticket.priority]||C.cyan}15`, color:PRIORITY_COLOR[ticket.priority]||C.cyan, fontWeight:700, textTransform:'uppercase' }}>{ticket.priority}</span>
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'rgba(130,160,200,0.1)', color:C.muted, textTransform:'uppercase' }}>{ticket.status}</span>
                <span style={{ fontSize:12, color:C.dim }}>{expanded===ticket.id ? '▲' : '▼'}</span>
              </div>
              {expanded===ticket.id && (
                <div style={{ padding:'0 18px 18px', borderTop:`1px solid ${C.border}` }}>
                  <p style={{ fontSize:13, color:C.muted, lineHeight:1.65, marginTop:14, marginBottom:16 }}>{ticket.message}</p>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <select value={ticket.status} onChange={e => updateTicket(ticket.id, { status: e.target.value })} style={iS}>
                      {['open','in_progress','resolved','closed'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                    </select>
                    <select value={ticket.priority} onChange={e => updateTicket(ticket.id, { priority: e.target.value })} style={iS}>
                      {['low','normal','high','critical'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {ticket.status !== 'resolved' && (
                      <button onClick={() => updateTicket(ticket.id, { status:'resolved' })} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:C.green, color:'#000', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>✓ Mark resolved</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
