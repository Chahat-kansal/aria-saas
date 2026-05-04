'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';

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

      // Build 7-day chart data from daily breakdown
      const daily: DayData[] = (weekRep.daily ?? []).map((d: any) => ({
        day: new Date(d.date).toLocaleDateString('en-AU', { weekday: 'short' }),
        revenue: d.total_revenue ?? 0,
      }));
      setChartData(daily);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Fetch Aria insight separately (non-blocking)
    setInsightLoading(true);
    fetch('/api/aria/pos-insight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then(d => { if (d.insight) setInsight(d.insight); })
      .catch(() => null)
      .finally(() => setInsightLoading(false));
  }, []);

  const quickLinks = [
    { label: 'Open Register', href: '/pos/terminal', icon: '🏪' },
    { label: 'Products', href: '/pos/products', icon: '📦' },
    { label: 'Customers', href: '/pos/customers', icon: '👥' },
    { label: 'Reports', href: '/pos/reports', icon: '📊' },
    { label: 'Stocktake', href: '/pos/stocktake', icon: '📋' },
    { label: 'Promotions', href: '/pos/promotions', icon: '🎁' },
    { label: 'Gift Cards', href: '/pos/gift-cards', icon: '🎴' },
    { label: 'Outlets', href: '/pos/outlets', icon: '📍' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">POS Dashboard</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Today — {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Link href="/pos/terminal" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#8B5CF6' }}>
          Open Register →
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Today's Revenue", value: loading ? '—' : `A$${stats!.today_revenue.toFixed(2)}`, color: '#16a34a', href: '/pos/reports/sales' },
          { label: 'Transactions', value: loading ? '—' : String(stats!.today_count), color: '#2563eb', href: '/pos/reports/sales' },
          { label: 'Avg Basket', value: loading ? '—' : `A$${stats!.avg_basket.toFixed(2)}`, color: '#7c3aed', href: '/pos/reports/sales' },
          { label: 'Register', value: loading ? '—' : stats!.open_session ? 'Open' : 'Closed', color: stats?.open_session ? '#16a34a' : '#dc2626', href: '/pos/sessions' },
        ].map(c => (
          <Link key={c.label} href={c.href} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider mb-1">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* 7-day sales chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5 shadow-sm">
          <p className="text-sm font-semibold text-[#1a1a16] mb-4">Revenue — last 7 days</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgba(26,26,22,.4)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`A$${Number(v).toFixed(2)}`, 'Revenue']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,.08)' }} />
                <Bar dataKey="revenue" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm text-[rgba(26,26,22,.3)]">{loading ? 'Loading…' : 'No sales data yet'}</p>
            </div>
          )}
        </div>

        {/* Aria insight */}
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-[rgba(29,158,117,.12)] flex items-center justify-center">
              <span className="text-[10px] font-bold" style={{ color: '#8B5CF6' }}>A</span>
            </div>
            <p className="text-xs font-semibold" style={{ color: '#8B5CF6' }}>Aria Insight</p>
            {(insightLoading) && <span className="inline-block w-3 h-3 rounded-full border border-[#8B5CF6] border-t-transparent animate-spin ml-auto" />}
          </div>
          {insight ? (
            <p className="text-sm text-[rgba(26,26,22,.7)] leading-relaxed flex-1">{insight}</p>
          ) : insightLoading ? (
            <div className="space-y-2 flex-1">
              {[...Array(3)].map((_, i) => <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${[90, 75, 55][i]}%` }} />)}
            </div>
          ) : (
            <p className="text-sm text-[rgba(26,26,22,.35)] flex-1">Start recording sales to get daily insights.</p>
          )}
          <Link href="/pos/reports/sales" className="text-xs mt-4" style={{ color: '#8B5CF6' }}>View full report →</Link>
        </div>
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div className="mb-6 bg-red-50 rounded-2xl border border-red-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-red-700">{lowStockItems.length} product{lowStockItems.length !== 1 ? 's' : ''} need restocking</p>
            <Link href="/pos/products" className="text-xs text-red-600 underline">View all →</Link>
          </div>
          <div className="space-y-1.5">
            {lowStockItems.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-red-100">
                <p className="text-sm font-medium text-[#1a1a16]">{p.name}</p>
                <span className="text-xs font-semibold text-red-600">{p.stock_quantity} left (reorder at {p.low_stock_threshold})</span>
              </div>
            ))}
            {lowStockItems.length > 5 && <p className="text-xs text-red-500 text-center mt-1">+ {lowStockItems.length - 5} more</p>}
          </div>
        </div>
      )}

      {/* Quick access */}
      <h2 className="text-xs font-semibold text-[rgba(26,26,22,.4)] uppercase tracking-wider mb-3">Quick Access</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map(l => (
          <Link key={l.href} href={l.href} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm hover:border-[#8B5CF6] hover:shadow-md transition-all text-center">
            <div className="text-2xl mb-2">{l.icon}</div>
            <p className="text-[13px] font-medium text-[#1a1a16]">{l.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
