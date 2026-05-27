'use client';
import { useState } from 'react';

interface Item { id: string; name: string; margin: number; weekly_sales: number; menu_price: number | null; cost_per_serve: number | null; quadrant: 'star' | 'gem' | 'workhorse' | 'review'; }

const Q_META = {
  star: { label: 'Stars', emoji: '⭐', color: '#22C55E' },
  gem: { label: 'Hidden gems', emoji: '💎', color: '#3b82f6' },
  workhorse: { label: 'Workhorses', emoji: '🐴', color: '#f59e0b' },
  review: { label: 'Review', emoji: '🔴', color: '#ef4444' },
};

export default function RecipeInsightsTab({ businessId }: { businessId: string }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Item[]>([]);
  const [insight, setInsight] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function run() {
    setLoading(true);
    const r = await fetch('/api/aria/menu-optimisation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId }),
    }).then(r => r.json()).catch(() => ({ analysis: [], insight: '' }));
    setAnalysis(r.analysis ?? []);
    setInsight(r.insight ?? '');
    setLoaded(true);
    setLoading(false);
  }

  const maxSales = Math.max(1, ...analysis.map(a => a.weekly_sales));

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold mb-0.5">✦ Menu optimisation</h3>
            <p className="text-xs" style={{ color: '#6b7280' }}>Aria classifies your menu by margin and sales velocity</p>
          </div>
          <button onClick={run} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
            style={{ background: '#1D9E75' }}>
            {loading ? 'Analysing…' : loaded ? 'Re-run analysis' : '✦ Analyse menu'}
          </button>
        </div>
      </div>

      {loaded && analysis.length > 0 && (
        <>
          {/* 2x2 scatter chart */}
          <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>Margin × Sales velocity</p>
            <div className="relative h-64 mx-8" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                <div className="border-r border-b border-[rgba(255,255,255,0.05)] flex items-start justify-end p-2 text-xs" style={{ color: '#3b82f6' }}>💎 Gems</div>
                <div className="border-b border-[rgba(255,255,255,0.05)] flex items-start justify-end p-2 text-xs" style={{ color: '#22C55E' }}>⭐ Stars</div>
                <div className="border-r border-[rgba(255,255,255,0.05)] flex items-end justify-end p-2 text-xs" style={{ color: '#ef4444' }}>🔴 Review</div>
                <div className="flex items-end justify-end p-2 text-xs" style={{ color: '#f59e0b' }}>🐴 Workhorses</div>
              </div>
              {analysis.map((a, i) => {
                const x = Math.min(100, Math.max(0, a.margin));
                const y = Math.min(100, (a.weekly_sales / maxSales) * 100);
                return (
                  <div key={i} title={`${a.name} · ${a.margin.toFixed(0)}% margin · ${a.weekly_sales.toFixed(1)}/wk`}
                    className="absolute w-2.5 h-2.5 rounded-full"
                    style={{ left: `${x}%`, bottom: `${y}%`, background: Q_META[a.quadrant].color, transform: 'translate(-50%, 50%)' }} />
                );
              })}
            </div>
            <div className="flex justify-between text-xs mt-2" style={{ color: '#6b7280' }}>
              <span>0% margin</span><span>60% (threshold)</span><span>100%</span>
            </div>
          </div>

          {/* Quadrant lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['star', 'gem', 'workhorse', 'review'] as const).map(q => {
              const items = analysis.filter(a => a.quadrant === q);
              const m = Q_META[q];
              return (
                <div key={q} className="rounded-xl p-4" style={{ background: '#13131a', border: `1px solid ${m.color}33` }}>
                  <p className="text-sm font-medium mb-2" style={{ color: m.color }}>{m.emoji} {m.label} ({items.length})</p>
                  {items.length === 0 ? <p className="text-xs" style={{ color: '#4b5563' }}>None yet</p> : (
                    <div className="space-y-1">
                      {items.map(a => (
                        <div key={a.id} className="flex justify-between text-xs">
                          <span style={{ color: '#d1d5db' }}>{a.name}</span>
                          <span style={{ color: '#9ca3af' }}>{a.margin.toFixed(0)}% · {a.weekly_sales.toFixed(1)}/wk</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {insight && (
            <div className="rounded-xl p-4 whitespace-pre-wrap text-sm" style={{ background: 'rgba(29,158,117,0.06)', color: '#d1d5db', border: '1px solid rgba(29,158,117,0.2)' }}>
              <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#1D9E75' }}>✦ Aria&apos;s recommendations</p>
              {insight}
            </div>
          )}
        </>
      )}
    </div>
  );
}
