'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface ABCItem {
  id: string;
  name: string;
  category: string | null;
  revenue_cents: number;
  units_sold: number;
  revenue_pct: number;
  cumulative_pct: number;
  abc_class: 'A' | 'B' | 'C';
}

interface ABCSummary {
  a_count: number; b_count: number; c_count: number;
  a_revenue_pct: number; b_revenue_pct: number; c_revenue_pct: number;
}

const CLASS_STYLE = {
  A: { bg: 'rgba(29,158,117,0.15)', text: '#1D9E75', label: 'A — Top sellers' },
  B: { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', label: 'B — Steady movers' },
  C: { bg: 'rgba(239,68,68,0.08)', text: '#ef4444', label: 'C — Slow movers' },
};

export default function ABCPage() {
  const { business } = useBusinessContext();
  const [items, setItems] = useState<ABCItem[]>([]);
  const [summary, setSummary] = useState<ABCSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [days, setDays] = useState(90);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [noData, setNoData] = useState(false);

  const runAnalysis = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setNoData(false);
    try {
      const res = await fetch('/api/warehouse/abc-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, days }),
      });
      const data = await res.json();
      if (data.no_data) { setNoData(true); setItems([]); }
      else { setItems(data.items ?? []); setSummary(data.summary); setTotalRevenue(data.total_revenue_cents ?? 0); }
    } finally {
      setLoading(false);
    }
  }, [business?.id, days]);

  useEffect(() => { runAnalysis(); }, [runAnalysis]);

  const displayed = filter === 'all' ? items : items.filter(i => i.abc_class === filter);

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#0d0d14' }}>
      <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div>
          <h1 className="font-semibold text-white text-lg">ABC Analysis</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            Product classification by revenue contribution
          </p>
        </div>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          className="text-xs px-3 py-1.5 rounded-lg outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="p-6 space-y-5 max-w-5xl mx-auto w-full">
        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-4">
            {(['A', 'B', 'C'] as const).map(cls => {
              const s = CLASS_STYLE[cls];
              const count = summary[`${cls.toLowerCase()}_count` as keyof ABCSummary] as number;
              const pct = summary[`${cls.toLowerCase()}_revenue_pct` as keyof ABCSummary] as number;
              return (
                <div key={cls} className="rounded-xl p-4 border cursor-pointer"
                  style={{ background: filter === cls ? s.bg : 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                  onClick={() => setFilter(filter === cls ? 'all' : cls)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.text }}>
                      Class {cls}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{count} products</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: s.text }}>{pct}%</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>of total revenue</p>
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Visual distribution bar */}
        {summary && (
          <div className="rounded-xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>Revenue distribution</p>
            <div className="flex rounded-full overflow-hidden h-4">
              <div style={{ width: `${summary.a_revenue_pct}%`, background: '#1D9E75' }} />
              <div style={{ width: `${summary.b_revenue_pct}%`, background: '#fbbf24' }} />
              <div style={{ width: `${summary.c_revenue_pct}%`, background: '#ef4444' }} />
            </div>
            <div className="flex items-center gap-6 mt-2">
              {[
                { label: 'A', color: '#1D9E75', pct: summary.a_revenue_pct },
                { label: 'B', color: '#fbbf24', pct: summary.b_revenue_pct },
                { label: 'C', color: '#ef4444', pct: summary.c_revenue_pct },
              ].map(x => (
                <div key={x.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: x.color }} />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Class {x.label}: {x.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['all', 'A', 'B', 'C'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{
                background: filter === f ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.04)',
                color: filter === f ? '#1D9E75' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${filter === f ? 'rgba(29,158,117,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              {f === 'all' ? 'All products' : `Class ${f}`}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : noData ? (
          <div className="text-center py-16" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <p className="text-lg mb-2">No sales data yet</p>
            <p className="text-sm">Record some sales to generate ABC analysis.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="grid text-xs px-4 py-2.5 font-medium" style={{ gridTemplateColumns: '1fr 80px 100px 80px 60px', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
              <span>Product</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">% of total</span>
              <span className="text-right">Units sold</span>
              <span className="text-center">Class</span>
            </div>
            {displayed.slice(0, 100).map((item, idx) => {
              const style = CLASS_STYLE[item.abc_class];
              return (
                <div key={item.id}
                  className="grid px-4 py-3 text-xs border-t items-center"
                  style={{ gridTemplateColumns: '1fr 80px 100px 80px 60px', borderColor: 'rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <div className="min-w-0">
                    <p className="text-white truncate">{item.name}</p>
                    {item.category && <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.category}</p>}
                  </div>
                  <p className="text-right" style={{ color: '#e5e7eb' }}>A${(item.revenue_cents / 100).toFixed(0)}</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="flex-1 max-w-[40px] bg-[rgba(255,255,255,0.06)] rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(item.revenue_pct * 3, 100)}%`, background: style.text }} />
                    </div>
                    <span style={{ color: '#9ca3af' }}>{item.revenue_pct}%</span>
                  </div>
                  <p className="text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>{item.units_sold}</p>
                  <div className="flex justify-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: style.bg, color: style.text }}>
                      {item.abc_class}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
