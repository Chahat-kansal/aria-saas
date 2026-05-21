'use client';
import { useCallback, useEffect, useState } from 'react';
import { AriaIntelligencePanel } from '@/components/dashboard/AriaIntelligencePanel';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface ForecastItem {
  item_id: string;
  item_name: string;
  current_stock: number;
  velocity_per_day: number;
  adjusted_days_remaining: number;
  holiday_uplift: number;
  suggested_order: number;
  recommended_order_date: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  unit: string;
}

interface Forecast {
  items: ForecastItem[];
  upcoming_holidays: { name: string; date: string; days_away: number }[];
  ai_summary: {
    summary: string;
    urgent_items: string[];
    holiday_note: string | null;
    recommended_actions: { action: string; by_when: string }[];
  } | null;
  generated_at: string;
  cached?: boolean;
  no_data?: boolean;
  no_data_message?: string;
}

interface ReorderSettings {
  min_daily_sales: number;     // only include if selling >= X/day
  min_stock_threshold: number; // only include if stock <= X units
  order_weeks_cover: number;   // order enough for X weeks
}

const URGENCY = {
  critical: { bg: 'bg-red-500/15 text-red-400 border border-red-500/20', label: 'Critical' },
  high: { bg: 'bg-amber-400/15 text-amber-400 border border-amber-400/20', label: 'High' },
  medium: { bg: 'bg-blue-500/15 text-blue-400 border border-blue-500/20', label: 'Medium' },
  low: { bg: 'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.4)]', label: 'Low' },
};

const DEFAULT_SETTINGS: ReorderSettings = { min_daily_sales: 0, min_stock_threshold: 999, order_weeks_cover: 4 };

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-[rgba(255,255,255,0.04)]" />)}
    </div>
  );
}

function downloadCSV(items: ForecastItem[], overrides: Record<string, number>) {
  if (items.length === 0) return;
  const rows = items.map(i => ({
    Product: i.item_name,
    'Current Stock': i.current_stock,
    'Daily Sales': i.velocity_per_day.toFixed(2),
    'Days Left': i.adjusted_days_remaining.toFixed(0),
    'Order Qty': overrides[i.item_id] ?? i.suggested_order,
    Unit: i.unit,
    'Order By': i.recommended_order_date,
    Urgency: i.urgency,
  }));
  const headers = Object.keys(rows[0]).join(',');
  const csv = [headers, ...rows.map(r => Object.values(r).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'reorder-list.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function ReorderPage() {
  const { business } = useBusinessContext();
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<ReorderSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  // Per-item qty overrides (item_id → qty)
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  // Removed items (item_ids excluded from draft)
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  // Manually added items (free-text)
  const [manualItems, setManualItems] = useState<{ name: string; qty: number }[]>([]);
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState(1);

  const load = useCallback(async (force = false) => {
    if (!business?.id) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/aria/reorder-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, force_refresh: force, settings }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed');
      const data = await res.json();
      setForecast(data);
      setQtyOverrides({});
      setRemoved(new Set());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [business?.id, settings]);

  useEffect(() => { load(); }, [load]);

  const visibleItems = (forecast?.items ?? []).filter(i => !removed.has(i.item_id));
  const totalQty = visibleItems.reduce((s, i) => s + (qtyOverrides[i.item_id] ?? i.suggested_order), 0)
    + manualItems.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Smart Reorder</h1>
          <p style={{ color: '#6b7280' }}>Forecast based on sales velocity, stock levels and AU calendar signals.</p>
          {forecast?.generated_at && (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {forecast.cached ? 'Cached · ' : ''}Last updated: {new Date(forecast.generated_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(s => !s)}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: showSettings ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${showSettings ? 'rgba(127,184,151,0.3)' : 'rgba(255,255,255,0.08)'}`, color: showSettings ? '#7FB897' : '#9ca3af' }}>
            ⚙ Filters
          </button>
          <button onClick={() => load(true)} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
            {loading ? 'Analysing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="rounded-xl p-5 mb-5" style={{ background: 'rgba(127,184,151,0.05)', border: '1px solid rgba(127,184,151,0.15)' }}>
          <p className="text-sm font-semibold text-white mb-4">Reorder Filters <span className="text-xs font-normal ml-2" style={{ color: '#6b7280' }}>Click Refresh to apply</span></p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>Min daily sales to include</label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} step={0.1}
                  value={settings.min_daily_sales}
                  onChange={e => setSettings(s => ({ ...s, min_daily_sales: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <span className="text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>/day</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Skip products selling less than this</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>Stock threshold to trigger</label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} step={1}
                  value={settings.min_stock_threshold === 999 ? '' : settings.min_stock_threshold}
                  onChange={e => setSettings(s => ({ ...s, min_stock_threshold: parseInt(e.target.value) || 999 }))}
                  placeholder="Any"
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <span className="text-xs" style={{ color: '#6b7280' }}>units</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Only include if stock ≤ this</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>Order weeks to cover</label>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={26} step={1}
                  value={settings.order_weeks_cover}
                  onChange={e => setSettings(s => ({ ...s, order_weeks_cover: parseInt(e.target.value) || 4 }))}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <span className="text-xs" style={{ color: '#6b7280' }}>wks</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Order enough stock for this long</p>
            </div>
          </div>
        </div>
      )}

      <AriaIntelligencePanel mode="reorder" />
      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-900/20 text-red-400">{error}</div>}

      {forecast?.no_data && (
        <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="font-semibold text-white mb-1">Not enough data yet</p>
          <p className="text-sm mb-2" style={{ color: '#6b7280' }}>{forecast.no_data_message}</p>
        </div>
      )}
      {loading && !forecast && (
        <div>
          <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Aria is analysing your sales velocity...</p>
          <Skeleton />
        </div>
      )}

      {forecast && !forecast.no_data && (
        <>
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

          {forecast.ai_summary && (
            <div className="rounded-xl p-5 mb-5"
              style={{
                background: (forecast.ai_summary.urgent_items?.length ?? 0) > 2 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                border: (forecast.ai_summary.urgent_items?.length ?? 0) > 2 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(245,158,11,0.2)',
              }}>
              <p className="text-white text-sm font-medium mb-1">Aria&apos;s assessment</p>
              <p className="text-sm mb-3" style={{ color: '#d1d5db' }}>{forecast.ai_summary.summary}</p>
              {forecast.ai_summary.holiday_note && <p className="text-xs text-amber-300">{forecast.ai_summary.holiday_note}</p>}
            </div>
          )}

          {forecast.items.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-white font-semibold mb-1">All items have sufficient stock</p>
              <p className="text-sm" style={{ color: '#6b7280' }}>No orders needed based on current filters.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-white">
                  {visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''} in order
                  {removed.size > 0 && <span className="text-xs font-normal ml-2" style={{ color: '#6b7280' }}>({removed.size} removed)</span>}
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadCSV(visibleItems, qtyOverrides)}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Download CSV
                  </button>
                  <button onClick={() => window.print()}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Print
                  </button>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Product', 'Stock', 'Daily Sales', 'Days Left', 'Order Qty', 'Order By', 'Urgency', ''].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: '#0d0d14' }}>
                    {visibleItems.map(item => {
                      const urgency = URGENCY[item.urgency];
                      const qty = qtyOverrides[item.item_id] ?? item.suggested_order;
                      return (
                        <tr key={item.item_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="px-3 py-3 text-white font-medium max-w-[160px] truncate">{item.item_name}</td>
                          <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{item.current_stock} {item.unit}</td>
                          <td className="px-3 py-3" style={{ color: '#9ca3af' }}>{item.velocity_per_day.toFixed(1)}/day</td>
                          <td className="px-3 py-3" style={{ color: item.adjusted_days_remaining <= 3 ? '#ef4444' : item.adjusted_days_remaining <= 7 ? '#f59e0b' : '#9ca3af' }}>
                            {item.adjusted_days_remaining.toFixed(0)}d
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} value={qty}
                              onChange={e => setQtyOverrides(o => ({ ...o, [item.item_id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className="w-16 rounded-lg px-2 py-1 text-sm text-white text-center"
                              style={{ background: 'rgba(255,255,255,0.06)', border: qtyOverrides[item.item_id] !== undefined ? '1px solid rgba(127,184,151,0.4)' : '1px solid rgba(255,255,255,0.08)' }}
                            />
                          </td>
                          <td className="px-3 py-3 text-xs" style={{ color: '#9ca3af' }}>{item.recommended_order_date}</td>
                          <td className="px-3 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${urgency.bg}`}>{urgency.label}</span>
                          </td>
                          <td className="px-3 py-3">
                            <button onClick={() => setRemoved(r => new Set([...r, item.item_id]))}
                              className="text-xs px-2 py-1 rounded-lg transition-colors"
                              style={{ color: 'rgba(248,113,113,0.6)', border: '1px solid rgba(248,113,113,0.15)' }}
                              title="Remove from order">
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Manual additions */}
                    {manualItems.map((m, idx) => (
                      <tr key={`manual-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(127,184,151,0.03)' }}>
                        <td className="px-3 py-3 text-white font-medium">{m.name} <span className="text-xs ml-1" style={{ color: '#7FB897' }}>manual</span></td>
                        <td colSpan={3} />
                        <td className="px-3 py-2">
                          <input type="number" min={1} value={m.qty}
                            onChange={e => setManualItems(mi => mi.map((x, i) => i === idx ? { ...x, qty: Math.max(1, parseInt(e.target.value) || 1) } : x))}
                            className="w-16 rounded-lg px-2 py-1 text-sm text-white text-center"
                            style={{ background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.3)' }}
                          />
                        </td>
                        <td colSpan={2} />
                        <td className="px-3 py-3">
                          <button onClick={() => setManualItems(mi => mi.filter((_, i) => i !== idx))}
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{ color: 'rgba(248,113,113,0.6)', border: '1px solid rgba(248,113,113,0.15)' }}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add product row */}
              <div className="flex gap-2 items-center mb-3">
                <input
                  value={addName} onChange={e => setAddName(e.target.value)}
                  placeholder="Add product to order..."
                  className="flex-1 rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
                <input type="number" min={1} value={addQty} onChange={e => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 rounded-lg px-3 py-2 text-sm text-white text-center"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
                <button
                  onClick={() => { if (addName.trim()) { setManualItems(mi => [...mi, { name: addName.trim(), qty: addQty }]); setAddName(''); setAddQty(1); } }}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'rgba(127,184,151,0.12)', border: '1px solid rgba(127,184,151,0.3)', color: '#7FB897' }}>
                  + Add
                </button>
                {removed.size > 0 && (
                  <button onClick={() => setRemoved(new Set())}
                    className="px-3 py-2 rounded-lg text-xs"
                    style={{ color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Restore {removed.size} removed
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-sm pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                <span>{visibleItems.length + manualItems.length} lines · {totalQty} total units</span>
                <span>{qtyOverrides && Object.keys(qtyOverrides).length > 0 ? `${Object.keys(qtyOverrides).length} qty edited` : ''}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
