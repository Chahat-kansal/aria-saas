'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar      = dynamic(() => import('recharts').then(m => m.Bar),      { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const Tooltip  = dynamic(() => import('recharts').then(m => m.Tooltip),  { ssr: false });

interface Session {
  id: string;
  opened_at: string;
  opened_by: string | null;
  opening_float: number;
  total_cash_sales: number;
  total_card_sales: number;
  transaction_count: number;
  status: string;
}

interface DayRevenue { date: string; revenue: number; label: string; }

export default function POSHomePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingFloat, setOpeningFloat] = useState('200');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<DayRevenue[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [topProduct, setTopProduct] = useState<string | null>(null);
  const [insightText, setInsightText] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const r = await fetch('/api/pos/sessions');
      const d = await r.json();
      setSession(d.openSession ?? null);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSession();
    // Load supporting data (non-blocking)
    fetch('/api/pos/products')
      .then(r => r.json())
      .then(d => {
        const prods = d.products ?? [];
        const low = prods.filter((p: any) => p.track_stock && p.stock_quantity <= (p.low_stock_threshold ?? 5) && p.is_active).length;
        setLowStockCount(low);
      })
      .catch(() => null);

    // Build 7-day chart from recent sessions
    fetch('/api/pos/reports/closures')
      .then(r => r.json())
      .then(d => {
        const sessions: any[] = d.closures ?? [];
        const dayMap = new Map<string, number>();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const key = d.toISOString().split('T')[0];
          dayMap.set(key, 0);
        }
        for (const s of sessions) {
          const key = new Date(s.opened_at).toISOString().split('T')[0];
          if (dayMap.has(key)) {
            dayMap.set(key, (dayMap.get(key) ?? 0) + (s.total_cash_sales ?? 0) + (s.total_card_sales ?? 0));
          }
        }
        const chart: DayRevenue[] = Array.from(dayMap.entries()).map(([date, revenue]) => ({
          date,
          revenue: Math.round(revenue * 100) / 100,
          label: new Date(date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' }),
        }));
        setChartData(chart);
        // Top product heuristic
        const sorted = sessions.sort((a: any, b: any) => b.transaction_count - a.transaction_count);
        if (sorted[0]?.top_product) setTopProduct(sorted[0].top_product);
      })
      .catch(() => null);

    fetch('/api/aria/pos-insight?page=pos-home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then(d => { if (d.insight) setInsightText(d.insight); })
      .catch(() => null);
  }, [loadSession]);

  async function openRegister() {
    setOpening(true); setOpenError(null);
    try {
      const res = await fetch('/api/pos/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0 }),
      });
      const d = await res.json();
      if (!res.ok) { setOpenError(d.error ?? 'Failed to open register'); return; }
      await loadSession();
    } catch { setOpenError('Connection error — check your network'); }
    setOpening(false);
  }

  const todayRevenue = session ? (session.total_cash_sales ?? 0) + (session.total_card_sales ?? 0) : 0;
  const txCount = session?.transaction_count ?? 0;
  const avgBasket = txCount > 0 ? todayRevenue / txCount : 0;
  const estCash = session ? (session.opening_float ?? 0) + (session.total_cash_sales ?? 0) : 0;
  const openSince = session ? new Date(session.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '';

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-full bg-white flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
            <div className="flex justify-center mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                AriaPOS
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 text-center mb-1">Open Register</h1>
            <p className="text-sm text-gray-500 text-center mb-8">Count your float and open the register to start trading.</p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Opening float</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">A$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={openingFloat}
                  onChange={e => setOpeningFloat(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') openRegister(); }}
                  className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-lg font-mono focus:ring-2 focus:ring-[#059669] focus:border-transparent outline-none"
                  autoFocus />
              </div>
              {openError && (
                <p className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{openError}</p>
              )}
            </div>

            <button onClick={openRegister} disabled={opening}
              className="w-full h-13 py-3.5 bg-[#111827] hover:bg-gray-800 text-white font-semibold text-base rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {opening ? <><Spinner /> Opening…</> : 'Open Register'}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">You can close the register at any time from the terminal</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50 overflow-y-auto">
      {/* Session header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Register open since <span className="font-medium text-gray-700">{openSince}</span>
          {session.opened_by && <> · {session.opened_by}</>}
        </p>
        <button onClick={() => router.push('/pos/close')}
          className="text-sm px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors">
          Close Register
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Revenue today', value: `A$${todayRevenue.toFixed(2)}`, sub: `${txCount} transaction${txCount !== 1 ? 's' : ''}` },
            { label: 'Avg basket', value: `A$${avgBasket.toFixed(2)}`, sub: 'per transaction' },
            { label: 'Est. cash in drawer', value: `A$${estCash.toFixed(2)}`, sub: 'float + cash sales' },
            { label: 'Best seller today', value: topProduct ?? '—', sub: 'by volume', isText: true },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white border border-gray-100 rounded-xl px-5 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{kpi.label}</p>
              <p className={`font-bold font-mono text-gray-900 ${kpi.isText ? 'text-xl truncate' : 'text-2xl'}`}>{kpi.value}</p>
              <p className="text-sm text-gray-400 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* New Sale button */}
        <div className="flex justify-center">
          <button onClick={() => router.push('/pos/terminal')}
            className="w-72 h-[72px] bg-[#111827] hover:bg-gray-800 text-white text-xl font-semibold rounded-2xl shadow-md hover:shadow-lg hover:scale-[1.02] transition-all">
            New Sale →
          </button>
        </div>

        {/* Aria insight */}
        {insightText && (
          <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 border-l-[3px] border-l-[#059669]">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-[#059669]">Aria: </span>{insightText}
            </p>
          </div>
        )}
        {!insightText && (
          <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 border-l-[3px] border-l-[#059669] animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-3/4" />
          </div>
        )}

        {/* Low stock alert */}
        {lowStockCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-amber-700 font-medium">
              {lowStockCount} product{lowStockCount > 1 ? 's' : ''} need reordering
            </p>
            <a href="/dashboard/reorder" className="text-sm text-amber-700 font-semibold hover:underline">Review →</a>
          </div>
        )}

        {/* 7-day chart */}
        {chartData.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Last 7 days</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} barCategoryGap="30%">
                <Bar dataKey="revenue" fill="#059669" radius={[3, 3, 0, 0]} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`A$${v.toFixed(2)}`, 'Revenue']}
                  labelFormatter={(l: string) => {
                    const item = chartData.find(d => d.label === l || d.date === l);
                    return item?.label ?? l;
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}
