'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Supplier { name: string; total_orders: number; on_time_pct: number | null; fill_rate_pct: number | null; discrepancies: number; avg_lead_days: number | null; last_order: string; }
interface Insight { supplier: string; insight: string; rating: string; }

function ScoreBar({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value === null) return <span style={{ color: '#4b5563' }}>—</span>;
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 90 ? '#1D9E75' : value >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs w-8 text-right" style={{ color }}>{value}%</span>
    </div>
  );
}

export default function SuppliersPage() {
  const { business } = useBusinessContext();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/warehouse/suppliers?business_id=${business.id}`).then(r => r.json()).catch(() => ({ suppliers: [] }));
    setSuppliers(res.suppliers ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function getInsights() {
    if (!business?.id || !suppliers.length) return;
    setLoadingInsights(true);
    const res = await fetch('/api/aria/supplier-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, suppliers }),
    }).then(r => r.json()).catch(() => ({ insights: [] }));
    setInsights(res.insights ?? []);
    setLoadingInsights(false);
  }

  const insightMap: Record<string, Insight> = {};
  for (const ins of insights) insightMap[ins.supplier] = ins;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Supplier Performance</h1>
          <p style={{ color: '#6b7280' }}>Track on-time delivery, fill rates, and discrepancies per supplier.</p>
        </div>
        <button onClick={getInsights} disabled={loadingInsights || !suppliers.length}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center gap-2"
          style={{ background: 'rgba(29,158,117,0.15)', border: '1px solid rgba(29,158,117,0.3)' }}>
          {loadingInsights ? (
            <><span className="inline-block w-3 h-3 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />Analysing…</>
          ) : '✦ Aria Insights'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-center py-8" style={{ color: '#4b5563' }}>Loading…</p>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-4xl mb-3">🏭</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>No supplier data yet. Supplier performance is tracked automatically when you receive GRNs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => {
            const ins = insightMap[s.name];
            return (
              <div key={s.name} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-white font-medium">{s.name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                      {s.total_orders} GRN{s.total_orders !== 1 ? 's' : ''} · Last: {s.last_order}
                      {s.avg_lead_days ? ` · Avg lead: ${s.avg_lead_days}d` : ''}
                    </p>
                  </div>
                  {ins && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ins.rating === 'good' ? 'bg-green-900/30 text-green-400' : ins.rating === 'fair' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'}`}>
                      {ins.rating}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs mb-2" style={{ color: '#6b7280' }}>On-time delivery</p>
                    <ScoreBar value={s.on_time_pct} />
                  </div>
                  <div>
                    <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Fill rate</p>
                    <ScoreBar value={s.fill_rate_pct} />
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Discrepancies</p>
                    <p className="text-sm font-medium" style={{ color: s.discrepancies > 0 ? '#ef4444' : '#1D9E75' }}>
                      {s.discrepancies === 0 ? 'None' : `${s.discrepancies} found`}
                    </p>
                  </div>
                </div>
                {ins && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                      <span style={{ color: '#1D9E75' }}>✦ Aria: </span>{ins.insight}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
