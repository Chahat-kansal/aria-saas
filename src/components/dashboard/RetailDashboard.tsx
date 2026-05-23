'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MorningCommandCentre } from '@/components/dashboard/MorningCommandCentre';

interface Business { id: string; name: string; owner_name?: string; industry?: string; pos_enabled?: boolean | null; }
interface DailySale { total_amount: number; }
interface Product  { id: string; name: string; stock_quantity: number; low_stock_threshold: number; }
interface Leak     { id: string; title: string; monthly_loss: number; }
interface ActivityEvent { time: string; icon: string; narrative: string; link: string | null; }
interface Recommendation { id: string; title: string; priority: string; category: string; description: string; action_label: string; action_payload?: Record<string, string>; metric?: string; metric_label?: string; }

const GREETING = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const TODAY_STR = () => new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Quick actions definition — badges filled client-side
const QUICK_ACTIONS = [
  { label: 'New Sale',      href: '/pos/terminal',                        icon: '🏪', badgeKey: null            },
  { label: 'Restock',       href: '/pos/products?filter=low_stock',       icon: '📦', badgeKey: 'low_stock'     },
  { label: 'Reviews',       href: '/dashboard/reviews',                   icon: '⭐', badgeKey: 'reviews'       },
  { label: 'Winback',       href: '/dashboard/winback',                   icon: '📱', badgeKey: 'winback'       },
  { label: 'Ask Aria',      href: '/dashboard/ask-aria',                  icon: '✦',  badgeKey: null            },
  { label: 'Receive Stock', href: '/dashboard/warehouse/inbound',         icon: '🚚', badgeKey: null            },
  { label: 'Staff',         href: '/dashboard/staff',                     icon: '👤', badgeKey: 'staff_alerts'  },
  { label: 'Reports',       href: '/pos/reports',                         icon: '📊', badgeKey: null            },
] as const;

function PulseSkeleton() {
  return (
    <div className="rounded-xl p-5 animate-pulse" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="h-3 w-20 bg-[rgba(255,255,255,0.06)] rounded mb-3" />
      <div className="h-8 w-28 bg-[rgba(255,255,255,0.08)] rounded mb-2" />
      <div className="h-3 w-36 bg-[rgba(255,255,255,0.04)] rounded" />
    </div>
  );
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
      up ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-red-500/15 text-red-400'
    }`}>
      {up ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}


function RevenueChart({ businessId }: { businessId: string }) {
  const [data, setData] = React.useState<Array<{ day: string; revenue: number }>>([])
  const [loading, setLoading] = React.useState(true)
  const chartRef = React.useRef<HTMLCanvasElement>(null)
  const chartInst = React.useRef<unknown>(null)

  React.useEffect(() => {
    if (!businessId) return
    fetch('/api/pos/sales?business_id=' + businessId + '&limit=500')
      .then(r => r.json())
      .then(d => {
        const sales = (d.sales ?? []).filter((s: { status?: string }) => s.status !== 'voided')
        const byDate: Record<string, number> = {}
        for (const s of sales) {
          const day = (s as { created_at?: string }).created_at?.split('T')[0]
          if (day) byDate[day] = (byDate[day] ?? 0) + Number((s as { total_amount?: number }).total_amount ?? 0)
        }
        const last7: Array<{ day: string; revenue: number }> = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i)
          const dateStr = d.toISOString().split('T')[0]
          last7.push({ day: d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' }), revenue: Math.round(byDate[dateStr] ?? 0) })
        }
        setData(last7)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [businessId])

  React.useEffect(() => {
    if (loading || !chartRef.current || data.length === 0) return
    const win = window as unknown as Record<string, unknown>
    function build() {
      if (!win.Chart) return
      const ChartJS = win.Chart as { new(el: HTMLCanvasElement, cfg: unknown): unknown }
      if (chartInst.current) (chartInst.current as { destroy(): void }).destroy()
      const max = Math.max(...data.map(d => d.revenue), 1)
      chartInst.current = new ChartJS(chartRef.current!, {
        type: 'bar',
        data: {
          labels: data.map(d => d.day),
          datasets: [{ label: 'Revenue', data: data.map(d => d.revenue), backgroundColor: data.map(d => d.revenue === max ? '#1D9E75' : 'rgba(29,158,117,0.3)'), borderRadius: 6, borderSkipped: false }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, callback: (v: number) => 'A$' + Math.round(v/1000) + 'k' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          }
        }
      })
    }
    if (win.Chart) { build() } else {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
      s.onload = build
      document.head.appendChild(s)
    }
  }, [data, loading])

  if (loading) return null
  return (
    <div className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: '#E8EDE7' }}>Revenue — last 7 days</p>
        <p className="text-xs" style={{ color: '#6b7280' }}>A${data.reduce((s, d) => s + d.revenue, 0).toLocaleString('en-AU')} total</p>
      </div>
      <div style={{ position: 'relative', height: 160 }}>
        <canvas ref={chartRef} role="img" aria-label="Bar chart of revenue for the last 7 days" />
      </div>
    </div>
  )
}

export function RetailDashboard({ business }: { business: Business }) {
  const router = useRouter();
  const firstName = business.owner_name?.split(' ')[0] ?? 'there';

  // Live pulse data
  const [todaySales,      setTodaySales]      = useState<DailySale[] | null>(null);
  const [weekSales,       setWeekSales]       = useState<number | null>(null);
  const [lastWeekSales,   setLastWeekSales]   = useState<number | null>(null);
  const [todayLastWeek,   setTodayLastWeek]   = useState<number | null>(null);
  const [lowStock,        setLowStock]        = useState<Product[] | null>(null);
  const [leaks,           setLeaks]           = useState<Leak[] | null>(null);
  const [activity,        setActivity]        = useState<ActivityEvent[] | null>(null);
  const [badgeCounts,     setBadgeCounts]     = useState<Record<string, number>>({});
  const [briefingRecs,    setBriefingRecs]    = useState<Recommendation[]>([]);
  const [pulseLoading,    setPulseLoading]    = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  const loadPulse = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const sameDayLastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    try {
      const [todayRes, weekRes, lastWeekRes, todayLWRes, stockRes, leaksRes, badgeRes] = await Promise.all([
        fetch(`/api/pos/reports?from=${today}&to=${today}`).then(r => r.json()).catch(() => ({ summary: null })),
        fetch(`/api/pos/reports?from=${weekAgo.slice(0,10)}&to=${today}`).then(r => r.json()).catch(() => ({ summary: null })),
        fetch(`/api/pos/reports?from=${twoWeeksAgo.slice(0,10)}&to=${weekAgo.slice(0,10)}`).then(r => r.json()).catch(() => ({ summary: null })),
        fetch(`/api/pos/reports?from=${sameDayLastWeek}&to=${sameDayLastWeek}`).then(r => r.json()).catch(() => ({ summary: null })),
        fetch('/api/pos/products').then(r => r.json()).catch(() => ({ products: [] })),
        fetch('/api/aria/profit-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id }) }).then(r => r.json()).catch(() => ({ leaks: [] })),
        fetch(`/api/aria/badge-counts?business_id=${business.id}`).then(r => r.json()).catch(() => ({})),
      ]);

      const todayRevenue = todayRes.summary?.total_revenue ?? 0;
      const todayCount   = todayRes.summary?.transaction_count ?? 0;
      const todayAvg     = todayCount > 0 ? todayRevenue / todayCount : 0;

      setTodaySales([{ total_amount: todayRevenue }] as DailySale[]);
      setWeekSales(weekRes.summary?.total_revenue ?? 0);
      setLastWeekSales(lastWeekRes.summary?.total_revenue ?? 0);
      setTodayLastWeek(todayLWRes.summary?.total_revenue ?? null);

      const prods = stockRes.products ?? [];
      setLowStock(prods.filter((p: Product) => p.stock_quantity <= (p.low_stock_threshold ?? 5)));
      setLeaks(leaksRes.leaks ?? []);
      setBadgeCounts(badgeRes ?? {});

      // Synthetic "today's sales" list for display
      setTodaySales(Array(todayCount).fill(null).map(() => ({ total_amount: todayAvg })));
    } catch { /* silent */ }
    setPulseLoading(false);
  }, [business.id]);

  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/aria/activity-narrative?business_id=${business.id}`);
      if (res.ok) {
        const d = await res.json();
        setActivity(d.events ?? []);
      }
    } catch { /* silent */ }
    setActivityLoading(false);
  }, [business.id]);

  const loadBriefing = useCallback(async () => {
    try {
      const res = await fetch('/api/aria/daily-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      });
      // 401 / 429: session expired or rate-limited — stop silently, no retry
      if (res.status === 401 || res.status === 429) return;
      if (!res.ok) return;
      const d = await res.json();
      setBriefingRecs((d.recommendations ?? []).slice(0, 4));
    } catch { /* silent */ }
  }, [business.id]);

  useEffect(() => {
    loadPulse();
    loadActivity();
    loadBriefing();
  }, [loadPulse, loadActivity, loadBriefing]);

  // Derived numbers
  const todayRevenue  = todaySales?.reduce((s, r) => s + (r.total_amount ?? 0), 0) ?? 0;
  const todayCount    = todaySales?.length ?? 0;
  const weekRevenue   = weekSales ?? 0;
  const vsLastWeek    = lastWeekSales && lastWeekSales > 0 ? ((weekRevenue - lastWeekSales) / lastWeekSales) * 100 : null;
  const vsYesterday   = todayLastWeek != null && todayLastWeek > 0 ? ((todayRevenue - todayLastWeek) / todayLastWeek) * 100 : null;
  const weekPct       = lastWeekSales && lastWeekSales > 0 ? Math.min(100, (weekRevenue / lastWeekSales) * 100) : 50;
  const topPriority   = briefingRecs[0] ?? null;

  const PRIORITY_COLOR: Record<string, string> = {
    high: 'text-red-400', medium: 'text-amber-400', low: 'text-[#1D9E75]', urgent: 'text-red-400',
  };
  const CATEGORY_ICON: Record<string, string> = {
    customers: '👥', revenue: '💰', stock: '📦', reviews: '⭐', marketing: '📣', compliance: '✅',
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">

      {/* ─── Section 1: Morning Brief ─────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(29,158,117,0.12) 0%,#13131a 45%)', border: '1px solid rgba(29,158,117,0.2)' }}>
        <div className="flex flex-col md:flex-row md:items-center gap-4 px-5 pt-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#1D9E75] mb-1">
              {GREETING()}, {firstName}
            </p>
            <h1 className="text-2xl font-semibold text-white">{TODAY_STR()}</h1>
            {briefingRecs.length > 0 && (
              <p className="text-sm text-[rgba(255,255,255,0.5)] mt-0.5">
                {briefingRecs.length} thing{briefingRecs.length !== 1 ? 's' : ''} need your attention today
              </p>
            )}
          </div>
          <Link href="/dashboard/ask-aria"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors flex-shrink-0"
            style={{ background: '#1D9E75' }}>
            <span>✦</span> Ask Aria
          </Link>
        </div>

        {/* Recommendation cards */}
        <div className="px-4 py-4">
          {briefingRecs.length === 0 ? (
            <div className="flex items-center gap-3 py-3 px-2 text-[rgba(255,255,255,0.4)] text-sm">
              <span>🎉</span>
              <span>Your business looks healthy today — no urgent actions. Check back tomorrow morning.</span>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              {briefingRecs.map(rec => (
                <div key={rec.id} className="min-w-[260px] max-w-[300px] rounded-xl p-4 flex-shrink-0"
                  style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rec.priority === 'high' || rec.priority === 'urgent' ? 'bg-red-400' : rec.priority === 'medium' ? 'bg-amber-400' : 'bg-[#1D9E75]'}`} />
                    <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">
                      {CATEGORY_ICON[rec.category] ?? '💡'} {rec.category}
                    </span>
                  </div>
                  {rec.metric && (
                    <div className="mb-1">
                      <span className="text-3xl font-bold text-white">{rec.metric}</span>
                      {rec.metric_label && <span className="text-xs text-[rgba(255,255,255,0.4)] ml-2">{rec.metric_label}</span>}
                    </div>
                  )}
                  <p className="text-xs font-semibold text-white mb-1 leading-snug">{rec.title}</p>
                  <p className="text-[11px] text-[rgba(255,255,255,0.45)] leading-snug mb-3">{rec.description}</p>
                  {rec.action_payload?.href && (
                    <Link href={rec.action_payload.href}
                      className="text-[11px] font-semibold text-[#1D9E75] hover:text-[#8ff1c9] transition-colors">
                      {rec.action_label} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Section 2: Live Business Pulse ──────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {pulseLoading ? (
          <><PulseSkeleton /><PulseSkeleton /><PulseSkeleton /></>
        ) : (
          <>
            {/* TODAY */}
            <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-2">Revenue today</p>
              <div className="flex items-end gap-3 mb-1">
                <span className="text-3xl font-bold text-white">A${todayRevenue.toFixed(0)}</span>
                <TrendBadge pct={vsYesterday} />
              </div>
              <p className="text-xs text-[rgba(255,255,255,0.4)]">
                {todayCount} transaction{todayCount !== 1 ? 's' : ''}
                {todayCount > 0 ? ` · avg A$${(todayRevenue / todayCount).toFixed(0)}` : ''}
              </p>
              {todayRevenue === 0 && business.pos_enabled !== false && (
                <Link href="/pos" className="text-xs text-[#1D9E75] hover:text-[#8ff1c9] mt-2 inline-block transition-colors">
                  Open the register →
                </Link>
              )}
            </div>

            {/* THIS WEEK */}
            <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-2">Revenue this week</p>
              <div className="flex items-end gap-3 mb-2">
                <span className="text-3xl font-bold text-white">A${weekRevenue.toFixed(0)}</span>
                <TrendBadge pct={vsLastWeek} />
              </div>
              <div className="w-full h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden mb-1">
                <div className="h-full rounded-full bg-[#1D9E75] transition-all duration-700"
                  style={{ width: `${weekPct}%` }} />
              </div>
              <p className="text-xs text-[rgba(255,255,255,0.4)]">
                {vsLastWeek !== null ? `${Math.abs(vsLastWeek).toFixed(0)}% ${vsLastWeek >= 0 ? 'ahead of' : 'behind'} last week` : 'vs last week'}
              </p>
            </div>

            {/* TOP PRIORITY */}
            <div className="rounded-xl p-5" style={{
              background: topPriority ? 'rgba(29,158,117,0.06)' : '#13131a',
              border: `1px solid ${topPriority ? 'rgba(29,158,117,0.25)' : 'rgba(255,255,255,0.07)'}`,
            }}>
              <p className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-2">Top priority</p>
              {topPriority ? (
                <>
                  <p className={`text-sm font-semibold mb-1 ${PRIORITY_COLOR[topPriority.priority] ?? 'text-white'}`}>
                    {CATEGORY_ICON[topPriority.category] ?? '💡'} {topPriority.title}
                  </p>
                  <p className="text-[11px] text-[rgba(255,255,255,0.45)] mb-3 line-clamp-2">{topPriority.description}</p>
                  {topPriority.action_payload?.href && (
                    <Link href={topPriority.action_payload.href}
                      className="text-xs font-semibold text-[#1D9E75] hover:text-[#8ff1c9] transition-colors">
                      Act now →
                    </Link>
                  )}
                </>
              ) : (
                <div>
                  <p className="text-[#1D9E75] font-semibold text-sm mb-1">All clear today ✓</p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)]">No urgent items from Aria right now.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      
      {/* ─── Revenue Chart ───────────────────────────────── */}
      <RevenueChart businessId={business.id} />

{/* ─── Section 3: MorningCommandCentre (AI decisions) ── */}
      <MorningCommandCentre />

      {/* ─── Section 4: Insights Grid ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Inventory Health */}
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Inventory health</p>
            <Link href="/pos/products" className="text-xs text-[rgba(255,255,255,0.4)] hover:text-white transition-colors">Review →</Link>
          </div>
          {pulseLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-[rgba(255,255,255,0.06)] rounded w-3/4" />
              <div className="h-3 bg-[rgba(255,255,255,0.04)] rounded w-1/2" />
            </div>
          ) : lowStock && lowStock.length > 0 ? (
            <>
              <p className="text-xs text-amber-400 mb-2">{lowStock.length} product{lowStock.length !== 1 ? 's' : ''} below reorder point</p>
              <ul className="space-y-1.5">
                {lowStock.slice(0, 4).map(p => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="text-xs text-[rgba(255,255,255,0.6)] truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                      p.stock_quantity === 0 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>{p.stock_quantity === 0 ? 'Out' : `${p.stock_quantity} left`}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-[#1D9E75]">All stock levels healthy ✓</p>
          )}
        </div>

        {/* Profit Leaks */}
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Profit leaks</p>
            <Link href="/dashboard/profit-leaks" className="text-xs text-[rgba(255,255,255,0.4)] hover:text-white transition-colors">Analyse →</Link>
          </div>
          {pulseLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-[rgba(255,255,255,0.06)] rounded w-3/4" />
              <div className="h-3 bg-[rgba(255,255,255,0.04)] rounded w-1/2" />
            </div>
          ) : leaks && leaks.length > 0 ? (
            <>
              <p className="text-xs text-red-400 mb-2">
                A${leaks.reduce((s, l) => s + (l.monthly_loss ?? 0), 0).toLocaleString()}/mo detected
              </p>
              <ul className="space-y-1.5">
                {leaks.slice(0, 3).map(l => (
                  <li key={l.id} className="flex items-center justify-between">
                    <span className="text-xs text-[rgba(255,255,255,0.6)] truncate">{l.title}</span>
                    <span className="text-[10px] text-red-400 flex-shrink-0 ml-2">A${l.monthly_loss}/mo</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-[rgba(255,255,255,0.4)]">Run analysis to detect profit leaks</p>
          )}
        </div>
      </div>

      {/* ─── Section 5: Activity Feed ────────────────────────── */}
      <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white">Activity today</p>
          <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">Aria narrates</span>
        </div>
        {activityLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1,2,3].map(i => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.06)] flex-shrink-0" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className="h-3 bg-[rgba(255,255,255,0.06)] rounded w-4/5" />
                  <div className="h-2.5 bg-[rgba(255,255,255,0.04)] rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !activity || activity.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-3xl mb-2">🌅</p>
            <p className="text-sm text-[rgba(255,255,255,0.5)]">No activity yet today.</p>
            <p className="text-xs text-[rgba(255,255,255,0.3)] mt-1">Start by opening the register or recording a sale.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activity.slice(0, 8).map((event, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-base"
                  style={{ background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.15)' }}>
                  {event.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[rgba(255,255,255,0.7)] leading-snug">{event.narrative}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[rgba(255,255,255,0.3)]">{event.time}</span>
                    {event.link && (
                      <Link href={event.link} className="text-[10px] text-[#1D9E75] hover:text-[#8ff1c9] transition-colors">View →</Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Section 6: Quick Actions Bar ────────────────────── */}
      <div className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.3)] mb-3">Quick actions</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {QUICK_ACTIONS.filter(action => business.pos_enabled !== false || !action.href.startsWith('/pos')).map(action => {
            const count = action.badgeKey ? (badgeCounts[action.badgeKey] ?? 0) : 0;
            return (
              <button
                key={action.label}
                onClick={() => { router.prefetch(action.href); router.push(action.href); }}
                onMouseEnter={() => router.prefetch(action.href)}
                className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl flex-shrink-0 relative transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                style={{ minWidth: '72px' }}>
                <span className="text-xl">{action.icon === '✦' ? <span className="text-[#1D9E75] text-lg font-bold">✦</span> : action.icon}</span>
                <span className="text-[10px] text-[rgba(255,255,255,0.5)] whitespace-nowrap">{action.label}</span>
                {count > 0 && (
                  <span className="absolute top-2 right-2 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
