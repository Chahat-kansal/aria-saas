'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface ForecastItem {
  item_id: string; item_name: string; current_stock: number;
  velocity_per_day: number; days_remaining: number; adjusted_days_remaining: number;
  holiday_uplift: number; suggested_order: number; recommended_order_date: string;
  urgency: 'critical' | 'high' | 'medium' | 'low'; unit: string;
}
interface Holiday { name: string; date: string; days_away: number; }
interface AiSummary {
  summary: string; urgent_items: string[]; holiday_note: string | null;
  recommended_actions: { action: string; by_when: string }[];
}
interface Forecast {
  items: ForecastItem[]; upcoming_holidays: Holiday[];
  ai_summary: AiSummary | null; generated_at: string; cached?: boolean;
  no_data?: boolean; no_data_message?: string;
}

const URGENCY = {
  critical: { bg: 'bg-red-500/15 text-red-400 border border-red-500/20', label: 'Critical' },
  high:     { bg: 'bg-amber-400/15 text-amber-400 border border-amber-400/20', label: 'High' },
  medium:   { bg: 'bg-blue-500/15 text-blue-400 border border-blue-500/20', label: 'Medium' },
  low:      { bg: 'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.4)]', label: 'Low' },
};

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-[rgba(255,255,255,0.04)]" />
      ))}
    </div>
  );
}

function downloadCSV(items: ForecastItem[]) {
  const rows = items.map(i => ({
    Product: i.item_name, 'Current Stock': i.current_stock,
    'Daily Sales': i.velocity_per_day.toFixed(2), 'Days Left': i.adjusted_days_remaining.toFixed(0),
    'Suggested Order': i.suggested_order, Unit: i.unit, 'Order By': i.recommended_order_date, Urgency: i.urgency,
  }));
  const headers = Object.keys(rows[0]).join(',');
  const csv = [headers, ...rows.map(r => Object.values(r).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'reorder-list.csv'; a.click();
}

export default function ReorderPage() {
  const { business } = useBusinessContext();
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [christmasMode, setChristmasMode] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!business?.id) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/aria/reorder-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, force_refresh: force }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      setForecast(await res.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Smart Reorder</h1>
          <p style={{ color: '#6b7280' }}>AI-powered forecast based on sales velocity and upcoming events</p>
          {forecast?.generated_at && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {forecast.cached ? 'Cached · ' : ''}Last updated: {new Date(forecast.generated_at).toLocaleString()}
            </p>
          )}
        </div>
        <button onClick={() => load(true)} disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
          {loading ? 'Analysing…' : '↻ Refresh'}
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-900/20 text-red-400">{error}</div>}

      {/* No data state */}
      {forecast?.no_data && (
        <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-3xl mb-3">📊</div>
          <p className="text-white font-semibold mb-1">Not enough data yet</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>{forecast.no_data_message}</p>
        </div>
      )}

      {loading && !forecast && (
        <div>
          <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Aria is analysing your sales velocity…</p>
          <Skeleton />
        </div>
      )}

      {forecast && (
        <>
          {/* Upcoming holidays strip */}
          {forecast.upcoming_holidays.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
              {forecast.upcoming_holidays.map(h => (
                <div key={h.date}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium ${
                    h.days_away <= 7 ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                    h.days_away <= 30 ? 'bg-amber-400/15 text-amber-400 border border-amber-400/20' :
                    'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.5)]'
                  }`}>
                  {h.name} · {h.date.slice(5)} · {h.days_away}d away
                </div>
              ))}
            </div>
          )}

          {/* AI Summary */}
          {forecast.ai_summary && (
            <div className="rounded-xl p-5 mb-5"
              style={{ background: (forecast.ai_summary.urgent_items?.length ?? 0) > 2 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                border: (forecast.ai_summary.urgent_items?.length ?? 0) > 2 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(245,158,11,0.2)' }}>
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">🤖</span>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium mb-1">Aria&apos;s Assessment</p>
                  <p className="text-sm mb-3" style={{ color: '#d1d5db' }}>{forecast.ai_summary.summary}</p>
                  {forecast.ai_summary.holiday_note && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-amber-400/15 text-amber-400 mb-3">
                      🎄 {forecast.ai_summary.holiday_note}
                    </div>
                  )}
                  {forecast.ai_summary.recommended_actions?.length > 0 && (
                    <ul className="space-y-1">
                      {forecast.ai_summary.recommended_actions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#9ca3af' }}>
                          <span className="text-emerald-400 flex-shrink-0 mt-0.5">→</span>
                          <span>{a.action}</span>
                          <span className="ml-auto flex-shrink-0" style={{ color: '#6b7280' }}>{a.by_when}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Items table */}
          {forecast.items.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-3xl mb-3">🎉</div>
              <p className="text-white font-semibold mb-1">All items have sufficient stock</p>
              <p className="text-sm" style={{ color: '#6b7280' }}>No orders needed this week.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-white">{forecast.items.length} item{forecast.items.length !== 1 ? 's' : ''} to reorder</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setChristmasMode(m => !m)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${christmasMode ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'border border-[rgba(255,255,255,0.08)]'}`}
                    style={christmasMode ? {} : { color: 'rgba(255,255,255,0.4)' }}>
                    🎄 Christmas scenario
                  </button>
                  <button onClick={() => downloadCSV(forecast.items)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    ↓ Download CSV
                  </button>
                  <button onClick={() => window.print()}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Print
                  </button>
                </div>
              </div>
              {christmasMode && (
                <div className="mb-3 px-4 py-2 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                  🎄 Christmas scenario: showing order quantities with ×2.0 holiday uplift applied to all items
                </div>
              )}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Product','Stock','Daily Sales','Days Left','Holiday Impact','Order Qty','Order By','Urgency'].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: '#0d0d14' }}>
                    {forecast.items.map(item => {
                      const u = URGENCY[item.urgency];
                      const xmasOrder = christmasMode ? Math.ceil(item.velocity_per_day * 2.0 * 14 - item.current_stock) : null;
                      return (
                        <tr key={item.item_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="px-3 py-3 text-white font-medium max-w-[160px] truncate">{item.item_name}</td>
                          <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{item.current_stock} {item.unit}</td>
                          <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{item.velocity_per_day.toFixed(1)}/day</td>
                          <td className="px-3 py-3" style={{ color: item.adjusted_days_remaining <= 3 ? '#ef4444' : item.adjusted_days_remaining <= 7 ? '#f59e0b' : '#9ca3af' }}>
                            {item.adjusted_days_remaining.toFixed(0)}d
                          </td>
                          <td className="px-3 py-3 text-xs" style={{ color: christmasMode ? '#ef4444' : item.holiday_uplift > 1 ? '#f59e0b' : '#4b5563' }}>
                            {christmasMode ? '×2.0 🎄' : item.holiday_uplift > 1 ? `×${item.holiday_uplift.toFixed(1)}` : '—'}
                          </td>
                          <td className="px-3 py-3">
                            {christmasMode && xmasOrder !== null ? (
                              <span className="font-bold text-red-400">{Math.max(0, xmasOrder)} {item.unit} <span className="text-xs text-red-400/60">(was {item.suggested_order})</span></span>
                            ) : (
                              <span className={`font-bold ${item.urgency === 'critical' ? 'text-red-400' : item.urgency === 'high' ? 'text-amber-400' : 'text-white'}`}>
                                {item.suggested_order} {item.unit}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs" style={{ color: '#9ca3af' }}>{item.recommended_order_date}</td>
                          <td className="px-3 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${u.bg}`}>{u.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
