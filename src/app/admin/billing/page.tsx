'use client';
import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';

const C = { card: '#0A0E1A', border: 'rgba(0,229,255,0.08)', text: '#E8F4F8', muted: 'rgba(130,160,200,0.7)', dim: 'rgba(130,160,200,0.35)', cyan: '#00E5FF', green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6' };
const PLAN_PRICE: Record<string, number> = { free: 0, pro: 99, enterprise: 299, trial: 0, disabled: 0 };
const PLAN_COLORS: Record<string, string> = { free: '#374151', pro: '#3B82F6', enterprise: C.amber, trial: '#6B7280', disabled: C.red };

export default function BillingPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetch('/api/admin/businesses').then(r => r.json()).then(d => {
      setBusinesses(d.businesses || []); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const planCounts: Record<string, number> = {};
  for (const b of businesses) { const p = b.plan || 'free'; planCounts[p] = (planCounts[p] || 0) + 1; }
  const mrr = Object.entries(planCounts).reduce((s, [plan, count]) => s + count * (PLAN_PRICE[plan] || 0), 0);
  const arr = mrr * 12;

  const pieData = Object.entries(planCounts).map(([name, count]) => ({ name, count, revenue: count * (PLAN_PRICE[name] || 0) }));
  const trialsExpiring = businesses.filter(b => b.trial_ends_at && new Date(b.trial_ends_at) > new Date() && new Date(b.trial_ends_at) < new Date(Date.now() + 7 * 86400000));

  function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.dim, marginBottom: 8 }}>{label}</p>
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Billing</h1>
        <p style={{ fontSize: 13, color: C.muted }}>Revenue overview and plan distribution</p>
      </div>

      {loading ? <p style={{ color: C.muted }}>Loading…</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
            <StatCard label="MRR" value={`A$${mrr.toLocaleString()}`} sub="Monthly recurring revenue" />
            <StatCard label="ARR" value={`A$${arr.toLocaleString()}`} sub="Annual recurring revenue" />
            <StatCard label="Paying businesses" value={businesses.filter(b => b.plan === 'pro' || b.plan === 'enterprise').length} sub="Pro + Enterprise" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Plan Distribution</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={30}>
                    {pieData.map(d => <Cell key={d.name} fill={PLAN_COLORS[d.name] || '#374151'} />)}
                  </Pie>
                  <Legend formatter={(v: string) => <span style={{ fontSize: 11, color: C.muted }}>{v}</span>} />
                  <Tooltip contentStyle={{ background: '#0A0E1A', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Revenue by Plan</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Plan','Count','Monthly Rev','%'].map(h => <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', color:C.dim, padding:'4px 8px' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {pieData.sort((a,b) => b.revenue - a.revenue).map(d => (
                    <tr key={d.name} style={{ borderBottom:`1px solid rgba(0,229,255,0.04)` }}>
                      <td style={{ padding:'8px', color:C.text, textTransform:'capitalize', fontWeight:600 }}>{d.name}</td>
                      <td style={{ padding:'8px', color:C.muted, fontFamily:'monospace' }}>{d.count}</td>
                      <td style={{ padding:'8px', color:d.revenue > 0 ? C.green : C.dim, fontFamily:'monospace' }}>A${d.revenue.toLocaleString()}</td>
                      <td style={{ padding:'8px', color:C.muted, fontFamily:'monospace' }}>{mrr > 0 ? ((d.revenue/mrr)*100).toFixed(0) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {trialsExpiring.length > 0 && (
            <div style={{ background: C.card, border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 14, padding: '18px 20px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.amber, marginBottom: 12 }}>⚠️ Trials expiring in 7 days ({trialsExpiring.length})</p>
              {trialsExpiring.map(b => (
                <div key={b.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
                  <div>
                    <p style={{ fontSize:13, fontWeight:600, color:C.text }}>{b.name}</p>
                    <p style={{ fontSize:11, color:C.muted }}>Expires {new Date(b.trial_ends_at).toLocaleDateString('en-AU')}</p>
                  </div>
                  <a href={`/admin/businesses/${b.id}`} style={{ fontSize:11, padding:'5px 12px', borderRadius:7, border:`1px solid ${C.border}`, color:C.muted, textDecoration:'none' }}>View →</a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
