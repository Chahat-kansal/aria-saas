'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const C = { bg: 'rgba(17,15,26,0.95)', card: 'rgba(26,23,40,0.9)', border: '#2A2540', text: '#EDE8FF', muted: '#8B85A8', dim: '#4A4565', violet: '#8B5CF6', cyan: '#00E5FF', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

export default function ClosureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'revenue'|'customers'|'transactions'|'avg'>('revenue');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/pos/sessions?id=${id}`).then(r => r.json()),
      fetch(`/api/pos/reports/sales?session_id=${id}`).then(r => r.json()),
    ]).then(([sd, rpt]) => {
      setSession(sd.session ?? null);
      setSales(rpt.sales ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ padding: 32, background: C.bg, minHeight: '100%', color: C.text, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  const totalRevenue = sales.reduce((s, r) => s + (r.total_amount || 0), 0);
  const gst = totalRevenue * 10 / 110;
  const txCount = sales.length;

  // Build hourly data
  const hourMap: Record<string, { revenue: number; customers: number; transactions: number }> = {};
  for (const s of sales) {
    const h = new Date(s.created_at).getHours();
    const key = `${h.toString().padStart(2, '0')}:00`;
    if (!hourMap[key]) hourMap[key] = { revenue: 0, customers: 0, transactions: 0 };
    hourMap[key].revenue += s.total_amount || 0;
    hourMap[key].transactions += 1;
    if (s.customer_id) hourMap[key].customers += 1;
  }
  const hourlyData = Object.entries(hourMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, v]) => ({
      hour, ...v, avg: v.transactions > 0 ? v.revenue / v.transactions : 0,
    }));

  const chartKey = activeTab === 'revenue' ? 'revenue' : activeTab === 'customers' ? 'customers' : activeTab === 'transactions' ? 'transactions' : 'avg';

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/pos/reports/closures" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← Register Closures</Link>
          <span style={{ color: C.dim }}>/</span>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Closure Detail</h1>
        </div>
        <button onClick={() => window.print()}
          style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          🖨 Print
        </button>
      </div>

      {/* Session info grid */}
      {session && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Outlet', session.outlet_name ?? '—'],
              ['Register', session.register_name ?? '—'],
              ['Opened', session.opened_at ? new Date(session.opened_at).toLocaleString('en-AU') : '—'],
              ['Closed', session.closed_at ? new Date(session.closed_at).toLocaleString('en-AU') : '—'],
              ['Closed By', session.closed_by ?? '—'],
              ['Total Transactions', txCount],
            ].map(([l, v]) => (
              <div key={l as string}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 3 }}>{l}</p>
                <p style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 14, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 8 }}>Money Received</p>
          <p style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 800, color: C.cyan }}>A${totalRevenue.toFixed(2)}</p>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 8 }}>Transactions</p>
          <p style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 800, color: C.text }}>{txCount}</p>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 8 }}>GST (10%)</p>
          <p style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 800, color: C.amber }}>A${gst.toFixed(2)}</p>
        </div>
      </div>

      {/* Hourly chart */}
      {hourlyData.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Hourly Breakdown</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['revenue', 'customers', 'transactions', 'avg'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${activeTab === t ? C.cyan : C.border}`, background: activeTab === t ? 'rgba(0,229,255,0.1)' : 'transparent', color: activeTab === t ? C.cyan : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                  {t === 'avg' ? 'Avg Sale' : t}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={hourlyData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.cyan} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => chartKey === 'revenue' || chartKey === 'avg' ? `$${v}` : String(v)} />
              <Tooltip contentStyle={{ background: '#1A1728', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
              <Area type="monotone" dataKey={chartKey} stroke={C.cyan} strokeWidth={2} fill="url(#cGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty state if no sales */}
      {sales.length === 0 && !loading && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 48, textAlign: 'center' }}>
          <p style={{ color: C.muted, fontSize: 14 }}>No sales recorded in this session.</p>
        </div>
      )}
    </div>
  );
}
