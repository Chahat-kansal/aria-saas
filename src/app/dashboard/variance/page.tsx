'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface VItem {
  item_id: string; item_name: string; theoretical_stock: number; actual_stock: number;
  variance: number; variance_value_cents: number; variance_pct: number;
}
interface AiInsight { item_id: string; insight: string; }

function downloadCSV(items: VItem[]) {
  const rows = items.map(i => ({
    Product: i.item_name, Expected: i.theoretical_stock, Actual: i.actual_stock,
    Variance: i.variance, 'Value Gap (A$)': (i.variance_value_cents / 100).toFixed(2), '%': i.variance_pct,
  }));
  const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'variance-report.csv'; a.click();
}

export default function VariancePage() {
  const { business } = useBusinessContext();
  const [items, setItems] = useState<VItem[]>([]);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [totalLoss, setTotalLoss] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/aria/variance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const d = await res.json();
      setItems(d.items ?? []); setInsights(d.ai_insights ?? []); setTotalLoss(d.total_loss_cents ?? 0);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const lossItems = items.filter(i => i.variance < 0);
  const surplusItems = items.filter(i => i.variance > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Variance & Shrinkage</h1>
          <p style={{ color: '#6b7280' }}>Track the gap between expected and actual stock levels</p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button onClick={() => downloadCSV(items)}
              className="text-xs px-3 py-2 rounded-xl transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
              ↓ Export CSV
            </button>
          )}
          <button onClick={load} disabled={loading}
            className="text-xs px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-900/20 text-red-400">{error}</div>}

      {loading && items.length === 0 && (
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-[rgba(255,255,255,0.04)]" />)}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-3xl mb-3">🎉</div>
          <p className="text-white font-semibold mb-1">No significant variance detected</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>Your stock levels are accurate. Keep it up!</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl p-4" style={{ background: totalLoss > 0 ? 'rgba(239,68,68,0.1)' : '#13131a', border: totalLoss > 0 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Total shrinkage value</p>
              <p className="text-2xl font-semibold" style={{ color: totalLoss > 0 ? '#ef4444' : '#fff' }}>
                A${(totalLoss / 100).toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Items with loss</p>
              <p className="text-2xl font-semibold text-red-400">{lossItems.length}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Items with surplus</p>
              <p className="text-2xl font-semibold text-emerald-400">{surplusItems.length}</p>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Product','Expected','Actual','Variance','Value Gap','AI Insight'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ background: '#0d0d14' }}>
                {items.map(item => {
                  const isLoss = item.variance < 0;
                  const insight = insights.find(i => i.item_id === item.item_id);
                  return (
                    <>
                      <tr key={item.item_id}
                        className="cursor-pointer hover:bg-[rgba(255,255,255,0.02)]"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isLoss ? 'rgba(239,68,68,0.04)' : 'rgba(16,185,129,0.04)' }}
                        onClick={() => setExpanded(expanded === item.item_id ? null : item.item_id)}>
                        <td className="px-3 py-3 text-white font-medium">{item.item_name}</td>
                        <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{item.theoretical_stock}</td>
                        <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{item.actual_stock}</td>
                        <td className="px-3 py-3">
                          <span className={isLoss ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                            {isLoss ? '' : '+'}{item.variance} ({item.variance_pct}%)
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={isLoss ? 'text-red-400' : 'text-emerald-400'}>
                            {isLoss ? '-' : '+'}A${(item.variance_value_cents / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: '#6b7280' }}>
                          {insight ? insight.insight.slice(0, 50) + (insight.insight.length > 50 ? '…' : '') : '—'}
                        </td>
                      </tr>
                      {expanded === item.item_id && insight && (
                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td colSpan={6} className="px-4 py-3 text-xs" style={{ color: '#d1d5db' }}>
                            💡 {insight.insight}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Based on stock movements and sales in the last 30 days
          </p>
        </>
      )}
    </div>
  );
}
