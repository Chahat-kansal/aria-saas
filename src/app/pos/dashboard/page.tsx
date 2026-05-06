'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';

const C = { bg: 'rgba(17,15,26,0.95)', card: 'rgba(26,23,40,0.9)', border: '#2A2540', text: '#EDE8FF', muted: '#8B85A8', dim: '#4A4565', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

interface Stats { today_revenue: number; today_count: number; avg_basket: number; low_stock: number; open_session: boolean; }
interface DayData { day: string; revenue: number; }
interface LowStockItem { id: string; name: string; stock_quantity: number; low_stock_threshold: number; }

export default function POSDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chartData, setChartData] = useState<DayData[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    Promise.all([
      fetch(`/api/pos/reports?from=${today}&to=${today}`).then(r => r.json()),
      fetch('/api/pos/products').then(r => r.json()),
      fetch('/api/pos/sessions').then(r => r.json()),
      fetch(`/api/pos/reports?from=${sevenDaysAgo}&to=${today}`).then(r => r.json()),
    ]).then(([todayRep, prod, sess, weekRep]) => {
      const prods: LowStockItem[] = (prod.products ?? []).filter((p: any) =>
        p.track_stock && p.stock_quantity != null && p.low_stock_threshold != null && p.stock_quantity <= p.low_stock_threshold
      );
      setLowStockItems(prods);

      const txCount = todayRep.summary?.transaction_count ?? 0;
      const rev = todayRep.summary?.total_revenue ?? 0;
      setStats({
        today_revenue: rev,
        today_count: txCount,
        avg_basket: txCount > 0 ? rev / txCount : 0,
        low_stock: prods.length,
        open_session: !!sess.openSession,
      });

      const daily: DayData[] = (weekRep.daily ?? []).map((d: any) => ({
        day: new Date(d.date).toLocaleDateString('en-AU', { weekday: 'short' }),
        revenue: d.total_revenue ?? 0,
      }));
      setChartData(daily);
      setLoading(false);
    }).catch(() => setLoading(false));

    setInsightLoading(true);
    fetch('/api/aria/pos-insight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then(d => { if (d.insight) setInsight(d.insight); })
      .catch(() => null)
      .finally(() => setInsightLoading(false));
  }, []);

  const quickLinks = [
    { label: 'Open Register', href: '/pos/terminal', icon: '🏪' },
    { label: 'Products',      href: '/pos/products',  icon: '📦' },
    { label: 'Customers',     href: '/pos/customers', icon: '👥' },
    { label: 'Reports',       href: '/pos/reports',   icon: '📊' },
    { label: 'Stocktake',     href: '/pos/stocktake', icon: '📋' },
    { label: 'Promotions',    href: '/pos/promotions',icon: '🎁' },
    { label: 'Gift Cards',    href: '/pos/gift-cards',icon: '🎴' },
    { label: 'Outlets',       href: '/pos/outlets',   icon: '📍' },
  ];

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>POS Dashboard</h1>
          <p style={{ fontSize: 12, color: C.muted }}>Today — {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Link href="/pos/terminal"
          style={{ padding: '9px 20px', borderRadius: 9, background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Open Register →
        </Link>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: "Today's Revenue", value: loading ? '—' : `A$${stats!.today_revenue.toFixed(2)}`, color: C.green,  href: '/pos/reports/sales' },
          { label: 'Transactions',    value: loading ? '—' : String(stats!.today_count),              color: '#38BDF8', href: '/pos/reports/sales' },
          { label: 'Avg Basket',      value: loading ? '—' : `A$${stats!.avg_basket.toFixed(2)}`,     color: C.violet, href: '/pos/reports/sales' },
          { label: 'Register',        value: loading ? '—' : stats!.open_session ? 'Open' : 'Closed', color: stats?.open_session ? C.green : C.red, href: '/pos/sessions' },
        ].map(kpi => (
          <Link key={kpi.label} href={kpi.href}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', textDecoration: 'none', display: 'block' }}>
            <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{kpi.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: kpi.color, fontFamily: "'JetBrains Mono',monospace" }}>{kpi.value}</p>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, marginBottom: 14 }}>
        {/* 7-day chart */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>Revenue — last 7 days</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [`A$${Number(v).toFixed(2)}`, 'Revenue']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}`, background: '#1A1728', color: C.text }} />
                <Bar dataKey="revenue" fill={C.violet} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 13, color: C.dim }}>{loading ? 'Loading…' : 'No sales data yet'}</p>
            </div>
          )}
        </div>

        {/* Aria insight */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.violet }}>A</span>
            </div>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.violet }}>Aria Insight</p>
            {insightLoading && <div style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${C.violet}`, borderTopColor: 'transparent', animation: 'pos-processing 0.7s linear infinite', marginLeft: 'auto' }} />}
          </div>
          {insight ? (
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, flex: 1 }}>{insight}</p>
          ) : insightLoading ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[90, 75, 55].map((w, i) => (
                <div key={i} style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.05)', width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: C.dim, flex: 1 }}>Start recording sales to get daily insights.</p>
          )}
          <Link href="/pos/reports/sales" style={{ fontSize: 12, marginTop: 12, color: C.violet, textDecoration: 'none' }}>View full report →</Link>
        </div>
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div style={{ marginBottom: 14, background: 'rgba(239,68,68,0.06)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)', padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{lowStockItems.length} product{lowStockItems.length !== 1 ? 's' : ''} need restocking</p>
            <Link href="/pos/products" style={{ fontSize: 12, color: C.red, textDecoration: 'none' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lowStockItems.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.card, borderRadius: 8, padding: '8px 12px', border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{p.name}</p>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>{p.stock_quantity} left (reorder at {p.low_stock_threshold})</span>
              </div>
            ))}
            {lowStockItems.length > 5 && <p style={{ fontSize: 12, color: C.red, textAlign: 'center' }}>+ {lowStockItems.length - 5} more</p>}
          </div>
        </div>
      )}

      {/* Quick access */}
      <p style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Quick Access</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {quickLinks.map(l => (
          <Link key={l.href} href={l.href}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{l.icon}</div>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{l.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
