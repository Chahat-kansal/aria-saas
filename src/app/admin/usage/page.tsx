'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const C = { card: '#0A0E1A', border: 'rgba(0,229,255,0.08)', text: '#E8F4F8', muted: 'rgba(130,160,200,0.7)', dim: 'rgba(130,160,200,0.35)', cyan: '#00E5FF', amber: '#F59E0B' };

export default function UsagePage() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange]   = useState('30d');

  function fromDate() {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    return new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/usage?from=${fromDate()}`).then(r => r.json()).then(d => {
      setData(d); setLoading(false);
    }).catch(() => setLoading(false));
  }, [range]);

  const iS = { background: '#080C10', border: `1px solid rgba(0,229,255,0.12)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: C.text, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Usage & API Costs</h1>
          <p style={{ fontSize: 13, color: C.muted }}>{data?.total_events?.toLocaleString() || 0} events · Est. ${(data?.estimated_cost_usd || 0).toFixed(4)} USD</p>
        </div>
        <select value={range} onChange={e => setRange(e.target.value)} style={iS}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {loading ? <p style={{ color: C.muted }}>Loading…</p> : (
        <>
          {/* Event breakdown */}
          {data?.by_event?.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Events by type</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.by_event} margin={{ left: 0, right: 0, top: 0, bottom: 0 }} layout="vertical">
                    <XAxis type="number" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="event_type" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
                    <Tooltip contentStyle={{ background: '#0A0E1A', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 11 }} />
                    <Bar dataKey="count" fill={C.cyan} radius={[0,3,3,0]} name="Calls" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Cost breakdown</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Feature','Calls','Est. Cost'].map(h => <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.dim, padding:'4px 0' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{(data.by_event || []).map((e: any) => (
                    <tr key={e.event_type} style={{ borderBottom:`1px solid rgba(0,229,255,0.04)` }}>
                      <td style={{ padding:'7px 0', color:C.text, fontFamily:'monospace', fontSize:12 }}>{e.event_type}</td>
                      <td style={{ padding:'7px 0', color:C.muted, fontFamily:'monospace', fontSize:12 }}>{e.count.toLocaleString()}</td>
                      <td style={{ padding:'7px 0', color:C.amber, fontFamily:'monospace', fontSize:12 }}>${(e.est_cost_usd||0).toFixed(4)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Raw log */}
          {data?.logs?.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}` }}>
                <p style={{ fontSize:13, fontWeight:700, color:C.text }}>Recent usage log</p>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:`1px solid ${C.border}` }}>
                    {['Event','Business ID','Time'].map(h => <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.dim, padding:'8px 14px' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{data.logs.map((l: any, i: number) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'7px 14px', color:C.cyan, fontFamily:'monospace' }}>{l.event_type}</td>
                      <td style={{ padding:'7px 14px', color:C.muted, fontFamily:'monospace', fontSize:10 }}>{l.business_id?.slice(0,8)}…</td>
                      <td style={{ padding:'7px 14px', color:C.dim }}>{l.created_at ? new Date(l.created_at).toLocaleString('en-AU') : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
