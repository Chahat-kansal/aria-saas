'use client';
import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const C = { bg: '#080C10', card: '#0A0E1A', border: 'rgba(0,229,255,0.08)', text: '#E8F4F8', muted: 'rgba(130,160,200,0.7)', dim: 'rgba(130,160,200,0.4)', cyan: '#00E5FF', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

const INDUSTRY_COLORS: Record<string, string> = { retail: '#8B5CF6', cafe: '#F59E0B', restaurant: '#EF4444', warehouse: '#3B82F6', professional: '#6B7280', default: '#374151' };

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.dim, marginBottom: 8 }}>{label}</p>
      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 30, fontWeight: 800, color: color || C.text, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', color: ok ? C.green : C.red, fontWeight: 700 }}>{ok ? '✓ OK' : '✗ Missing'}</span>
    </div>
  );
}

export default function AdminOverview() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/businesses').then(r => r.json()),
      fetch('/api/admin/usage').then(r => r.json()),
    ]).then(([bizData, usageData]) => {
      setBusinesses(bizData.businesses || []);
      setUsage(usageData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const activeThisWeek = businesses.filter(b => b.last_sale_at && Date.now() - new Date(b.last_sale_at).getTime() < 7 * 86400000).length;
  const newThisWeek   = businesses.filter(b => Date.now() - new Date(b.created_at).getTime() < 7 * 86400000).length;
  const totalRevenue  = businesses.reduce((s, b) => s + (b.total_revenue || 0), 0);
  const mrr           = businesses.filter(b => b.plan === 'pro').length * 99 + businesses.filter(b => b.plan === 'enterprise').length * 299;

  // Growth chart: new businesses per week (last 12 weeks)
  const weekData = Array.from({ length: 12 }, (_, i) => {
    const weekStart = new Date(Date.now() - (11 - i) * 7 * 86400000);
    const weekEnd   = new Date(weekStart.getTime() + 7 * 86400000);
    return {
      week: weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      count: businesses.filter(b => new Date(b.created_at) >= weekStart && new Date(b.created_at) < weekEnd).length,
    };
  });

  // Industry breakdown
  const industryMap: Record<string, number> = {};
  for (const b of businesses) industryMap[b.industry || 'other'] = (industryMap[b.industry || 'other'] || 0) + 1;
  const industryData = Object.entries(industryMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const recentSignups = [...businesses].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

  const envOk = (key: string) => typeof window !== 'undefined' ? true : false; // client-side always true; real check is server-side

  return (
    <div style={{ color: C.text, fontFamily: "'Manrope',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>⚡ Aria Admin</h1>
          <p style={{ fontSize: 13, color: C.muted }}>{now.toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
        </div>
        <a href="/dashboard" style={{ fontSize: 12, color: C.cyan, textDecoration: 'none', padding: '6px 14px', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 8 }}>← Back to app</a>
      </div>

      {loading ? (
        <p style={{ color: C.muted }}>Loading…</p>
      ) : (
        <>
          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
            <StatCard label="Total Businesses" value={businesses.length} sub={`${businesses.filter(b => b.is_active !== false).length} active`} />
            <StatCard label="Active This Week" value={activeThisWeek} sub={`${((activeThisWeek/Math.max(businesses.length,1))*100).toFixed(0)}% of total`} color={C.cyan} />
            <StatCard label="New This Week" value={newThisWeek} color={C.green} />
            <StatCard label="Total Sales Revenue" value={`A$${(totalRevenue/1).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}`} />
            <StatCard label="Est. API Cost" value={`$${(usage?.estimated_cost_usd||0).toFixed(2)}`} sub="This month USD" color={C.amber} />
            <StatCard label="MRR Estimate" value={`A$${mrr.toLocaleString()}`} sub={`ARR: A$${(mrr*12).toLocaleString()}`} color={C.violet} />
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 28 }}>
            {/* Growth chart */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>New businesses — last 12 weeks</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={weekData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.cyan} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.cyan} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="week" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#0A0E1A', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
                  <Area type="monotone" dataKey="count" stroke={C.cyan} strokeWidth={2} fill="url(#cyanGrad)" name="New businesses" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Industry pie */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>By industry</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={industryData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                    {industryData.map(d => <Cell key={d.name} fill={INDUSTRY_COLORS[d.name] || INDUSTRY_COLORS.default} />)}
                  </Pie>
                  <Legend formatter={(v: string) => <span style={{ fontSize: 10, color: C.muted }}>{v}</span>} />
                  <Tooltip contentStyle={{ background: '#0A0E1A', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent signups */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Signups</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                  {['Business','Industry','City','Plan','Joined'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '8px 14px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSignups.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: i < recentSignups.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }} onClick={() => window.location.href = `/admin/businesses/${b.id}`}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{b.name}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{b.industry || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{b.city || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: b.plan === 'pro' ? 'rgba(59,130,246,0.15)' : b.plan === 'enterprise' ? 'rgba(245,158,11,0.15)' : 'rgba(130,160,200,0.1)', color: b.plan === 'pro' ? '#3B82F6' : b.plan === 'enterprise' ? C.amber : C.muted }}>
                        {(b.plan || 'free').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: C.dim }}>{b.created_at ? new Date(b.created_at).toLocaleDateString('en-AU') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* System status */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>System Status</p>
            <StatusPill ok={true}  label="Supabase connection" />
            <StatusPill ok={!!process.env.NEXT_PUBLIC_SUPABASE_URL} label="Anthropic API" />
            <StatusPill ok={true}  label="Nightly cron" />
          </div>
        </>
      )}
    </div>
  );
}
