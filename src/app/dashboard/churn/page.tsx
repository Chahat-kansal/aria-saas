'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid } from 'recharts';

interface ChurnCustomer { id: string; name: string; last_visit: string | null; total_spend: number | null; visit_count: number | null; churn_risk: string | null; rfm_recency_score: number | null; rfm_frequency_score: number | null; segment: string | null; days_since_visit: number | null; }
interface Promotion { promotion_name: string; offer_text: string; sms_message: string; recommended_time_to_send: string; rationale: string; }
interface CohortPoint { month: string; total: number; pct30: number; pct60: number; pct90: number }
interface PastPromo { id: string; created_at: string; promotion_name: string; offer_text: string; sms_message: string; target_day: string | null; was_successful: boolean | null }

const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const C = { bg: 'var(--bg-base)', card: '#13131a', text: 'var(--text-primary)', muted: '#6b7280', dim: '#4b5563', border: 'rgba(255,255,255,0.07)', green: '#22C55E', red: '#ef4444', amber: '#f59e0b' };

function daysAgo(date: string | null) { if (!date) return null; return Math.floor((Date.now() - new Date(date).getTime()) / 86400000); }
function churnScore(c: ChurnCustomer): number { const d = c.days_since_visit ?? daysAgo(c.last_visit) ?? 90; return Math.min(100, Math.round((d / 90) * 100)); }
function scoreColor(s: number) { return s > 60 ? '#ef4444' : s > 30 ? '#f59e0b' : '#22C55E'; }
function scoreLabel(s: number) { return s > 60 ? 'Churning' : s > 30 ? 'At Risk' : 'Safe'; }

export default function ChurnPage() {
  const { business } = useBusinessContext();
  const [customers, setCustomers] = useState<ChurnCustomer[]>([]);
  const [slowDayData, setSlowDayData] = useState<{ day: string; avg: number; pct: number }[]>([]);
  const [slowestDay, setSlowestDay] = useState<string | null>(null);
  const [insufficientData, setInsufficientData] = useState(false);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [generatingPromo, setGeneratingPromo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cohortData, setCohortData] = useState<CohortPoint[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<Record<string, number>>({});
  const [weatherData, setWeatherData] = useState<{ date: string; precip: number }[]>([]);
  const [pastPromos, setPastPromos] = useState<PastPromo[]>([]);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [custRes, slowRes, cohortRes, promoRes] = await Promise.all([
      fetch(`/api/customers?business_id=${business.id}&lapsed=30`).then(r => r.json()).catch(() => ({ customers: [] })),
      fetch(`/api/aria/slow-day-analysis?business_id=${business.id}`).then(r => r.json()).catch(() => ({ days: [], insufficient_data: true })),
      fetch(`/api/aria/cohort-retention?business_id=${business.id}`).then(r => r.json()).catch(() => ({ cohorts: [], daily_revenue: {} })),
      fetch(`/api/aria/promotions?business_id=${business.id}`).then(r => r.json()).catch(() => ({ promotions: [] })),
    ]);
    setCustomers(custRes.customers ?? []);
    if (slowRes.insufficient_data || !slowRes.days?.length) {
      setInsufficientData(true);
    } else {
      setSlowDayData(slowRes.days);
      setSlowestDay([...slowRes.days].sort((a: { avg: number }, b: { avg: number }) => a.avg - b.avg)[0]?.day ?? null);
      setInsufficientData(false);
    }
    setCohortData(cohortRes.cohorts ?? []);
    setDailyRevenue(cohortRes.daily_revenue ?? {});
    setPastPromos(promoRes.promotions ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch('/api/weather?mode=history');
        const d = await res.json();
        const dates: string[] = d.daily?.time ?? [];
        const precips: number[] = d.daily?.precipitation_sum ?? [];
        setWeatherData(dates.map((date, i) => ({ date, precip: precips[i] ?? 0 })));
      } catch { /* ignore */ }
    }
    fetchWeather();
  }, []);

  async function generatePromotion() {
    if (!business?.id) return;
    setGeneratingPromo(true);
    const res = await fetch('/api/aria/generate-promotion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, context: { slowest_day: slowestDay, insufficient_data: insufficientData } }),
    }).then(r => r.json()).catch(() => null);
    if (res) { setPromotion(res); load(); }
    setGeneratingPromo(false);
  }

  async function togglePromoSuccess(id: string, was_successful: boolean) {
    await fetch('/api/aria/promotions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, was_successful }) }).catch(() => null);
    setPastPromos(prev => prev.map(p => p.id === id ? { ...p, was_successful } : p));
  }

  const at_risk = customers.filter(c => { const d = daysAgo(c.last_visit); return d !== null && d >= 30 && d < 60; });
  const lapsed  = customers.filter(c => { const d = daysAgo(c.last_visit); return d !== null && d >= 60 && d < 90; });
  const lost    = customers.filter(c => { const d = daysAgo(c.last_visit); return d !== null && d >= 90; });
  const topRisk = [...customers].sort((a, b) => churnScore(b) - churnScore(a)).slice(0, 10);
  const maxAvg  = slowDayData.length ? Math.max(...slowDayData.map(d => d.avg)) : 1;

  const scatterData = weatherData
    .filter(w => dailyRevenue[w.date] !== undefined)
    .map(w => ({ x: Math.round(w.precip * 10) / 10, y: Math.round(dailyRevenue[w.date] ?? 0) }));
  const rainyDays  = weatherData.filter(w => w.precip > 5);
  const sunnyDays  = weatherData.filter(w => w.precip <= 5);
  const rainyAvg   = rainyDays.length ? rainyDays.reduce((s, w) => s + (dailyRevenue[w.date] ?? 0), 0) / rainyDays.length : 0;
  const sunnyAvg   = sunnyDays.length ? sunnyDays.reduce((s, w) => s + (dailyRevenue[w.date] ?? 0), 0) / sunnyDays.length : 0;
  const weatherDiff = Math.abs(sunnyAvg - rainyAvg);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto" style={{ color: C.text }}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Churn & Slow Days</h1>
        <p style={{ color: C.muted }}>Customers at risk and your slowest revenue periods</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[{ label: 'At risk (30-60d)', value: at_risk.length, color: C.amber }, { label: 'Lapsed (60-90d)', value: lapsed.length, color: '#f97316' }, { label: 'Lost (90d+)', value: lost.length, color: C.red }, { label: 'Customers tracked', value: customers.length, color: '#fff' }].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: C.card, border: '1px solid ' + C.border }}>
            <p className="text-xs mb-1" style={{ color: C.muted }}>{s.label}</p>
            <p className="text-2xl font-semibold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Churn prediction scores */}
      {topRisk.length > 0 && (
        <div className="rounded-xl p-5 mb-6" style={{ background: C.card, border: '1px solid ' + C.border }}>
          <h2 className="font-medium text-white text-sm mb-4">Churn Prediction — Top {topRisk.length} At-Risk Customers</h2>
          <div className="space-y-3">
            {topRisk.map(c => {
              const s = churnScore(c);
              const col = scoreColor(s);
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-xs text-white w-32 truncate shrink-0">{c.name}</span>
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: s + '%', background: col }} />
                  </div>
                  <span className="text-xs font-bold w-8 shrink-0" style={{ color: col }}>{s}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: col + '20', color: col }}>{scoreLabel(s)}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs mt-4" style={{ color: C.dim }}>Score 0-30 = Safe · 31-60 = At Risk · 61-100 = Churning</p>
        </div>
      )}

      {/* Slow day chart + Playbook */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl p-5" style={{ background: C.card, border: '1px solid ' + C.border }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-medium text-white text-sm">Revenue by day of week</h2>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>Last 90 days average</p>
            </div>
            <button onClick={generatePromotion} disabled={generatingPromo}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
              {generatingPromo ? 'Generating…' : '✦ Create promo'}
            </button>
          </div>
          {insufficientData ? (
            <p className="text-sm py-6 text-center" style={{ color: C.muted }}>Record at least 30 days of sales to see slow day analysis.</p>
          ) : (
            <div className="space-y-2">
              {slowDayData.sort((a, b) => DOW.indexOf(a.day) - DOW.indexOf(b.day)).map(d => {
                const isSlowest = d.day === slowestDay;
                return (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="text-xs w-20 shrink-0" style={{ color: isSlowest ? C.red : '#9ca3af' }}>{d.day.slice(0, 3)}</span>
                    <div className="flex-1 h-5 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-lg" style={{ width: (maxAvg > 0 ? (d.avg / maxAvg) * 100 : 0) + '%', background: isSlowest ? C.red : '#1D9E75' }} />
                    </div>
                    <span className="text-xs w-16 text-right shrink-0" style={{ color: isSlowest ? C.red : '#9ca3af' }}>A${(d.avg / 100).toFixed(0)}</span>
                    {isSlowest && <span className="text-xs shrink-0" style={{ color: C.red }}>↓</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Slow day playbook */}
        <div className="rounded-xl p-5" style={{ background: C.card, border: '1px solid ' + C.border }}>
          <h2 className="font-medium text-white text-sm mb-3">Slow Day Playbook{slowestDay ? ` — ${slowestDay}` : ''}</h2>
          {slowestDay ? (
            <div className="space-y-3">
              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border }}>
                <p className="text-xs font-semibold mb-1" style={{ color: C.amber }}>💼 Staff action</p>
                <p className="text-xs" style={{ color: '#d1d5db' }}>Reduce to 1 staff member on {slowestDay} — est. saving ~$250</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#3B82F6' }}>📦 Prep action</p>
                <p className="text-xs" style={{ color: '#d1d5db' }}>Order 30% less perishables for {slowestDay} deliveries</p>
              </div>
              {promotion ? (
                <div className="rounded-lg p-3" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#1D9E75' }}>✦ Promo action — {promotion.promotion_name}</p>
                  <p className="text-xs mb-2" style={{ color: '#d1d5db' }}>{promotion.offer_text}</p>
                  <div className="text-xs px-3 py-2 rounded mb-2" style={{ background: 'rgba(255,255,255,0.04)', color: '#d1d5db' }}>{promotion.sms_message}</div>
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(promotion.sms_message)} className="text-xs" style={{ color: '#1D9E75' }}>Copy SMS</button>
                    <button onClick={generatePromotion} className="text-xs" style={{ color: C.dim }}>↻ Regenerate</button>
                  </div>
                  <p className="text-xs mt-2 italic" style={{ color: C.dim }}>Send: {promotion.recommended_time_to_send}</p>
                </div>
              ) : (
                <button onClick={generatePromotion} disabled={generatingPromo}
                  className="w-full py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                  style={{ background: '#1D9E75' }}>
                  {generatingPromo ? 'Generating…' : '✦ Generate AI promo for ' + slowestDay}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm py-6 text-center" style={{ color: C.muted }}>Add more sales data to unlock the slow day playbook.</p>
          )}
        </div>
      </div>

      {/* Cohort retention chart */}
      {cohortData.length > 0 && (
        <div className="rounded-xl p-5 mb-6" style={{ background: C.card, border: '1px solid ' + C.border }}>
          <h2 className="font-medium text-white text-sm mb-4">Customer Retention by Month</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={cohortData} margin={{ top: 4, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v, n) => [`${v}%`, String(n)]} contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="pct30" name="30-day" fill={C.green} radius={[2, 2, 0, 0]} />
              <Bar dataKey="pct60" name="60-day" fill={C.amber} radius={[2, 2, 0, 0]} />
              <Bar dataKey="pct90" name="90-day" fill={C.red} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs mt-2" style={{ color: C.dim }}>% of customers from each cohort who returned at 30 / 60 / 90 days</p>
        </div>
      )}

      {/* Weather correlation */}
      {weatherData.length > 0 && (
        <div className="rounded-xl p-5 mb-6" style={{ background: C.card, border: '1px solid ' + C.border }}>
          <h2 className="font-medium text-white text-sm mb-2">Weather Impact on Revenue</h2>
          {weatherDiff > 0 && (
            <p className="text-xs mb-4" style={{ color: sunnyAvg > rainyAvg ? C.green : C.amber }}>
              {sunnyAvg > rainyAvg
                ? `☀️ Sunny days average $${weatherDiff.toFixed(0)} more revenue than rainy days`
                : `🌧 Rainy days average $${weatherDiff.toFixed(0)} more revenue than sunny days`}
            </p>
          )}
          {scatterData.length > 1 ? (
            <ResponsiveContainer width="100%" height={130}>
              <ScatterChart margin={{ top: 4, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="x" name="Rain (mm)" type="number" tick={{ fontSize: 10, fill: '#6b7280' }} label={{ value: 'Rain (mm)', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#6b7280' }} />
                <YAxis dataKey="y" name="Revenue" type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `$${v}`} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, n) => [String(n) === 'Rain (mm)' ? `${v}mm` : `$${v}`, String(n)]} />
                <Scatter data={scatterData} fill="#8B5CF6" opacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs" style={{ color: C.dim }}>Cross-referencing weather with revenue once more daily data is available.</p>
          )}
        </div>
      )}

      {/* Promotion history */}
      {pastPromos.length > 0 && (
        <div className="rounded-xl mb-6 overflow-hidden" style={{ border: '1px solid ' + C.border }}>
          <div className="px-5 py-3" style={{ background: C.card, borderBottom: '1px solid ' + C.border }}>
            <h2 className="font-medium text-white text-sm">Past Promotions</h2>
          </div>
          <div style={{ background: '#0d0d14' }}>
            {pastPromos.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{p.promotion_name}</p>
                  <p className="text-xs truncate" style={{ color: C.muted }}>{p.offer_text}</p>
                  <p className="text-xs" style={{ color: C.dim }}>{new Date(p.created_at).toLocaleDateString('en-AU')}{p.target_day ? ` · ${p.target_day}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs" style={{ color: C.dim }}>Did it work?</span>
                  <button onClick={() => togglePromoSuccess(p.id, true)}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: p.was_successful === true ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)', color: p.was_successful === true ? C.green : C.dim, border: '1px solid ' + (p.was_successful === true ? 'rgba(34,197,94,0.3)' : C.border) }}>
                    ✓ Yes
                  </button>
                  <button onClick={() => togglePromoSuccess(p.id, false)}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: p.was_successful === false ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)', color: p.was_successful === false ? C.red : C.dim, border: '1px solid ' + (p.was_successful === false ? 'rgba(239,68,68,0.3)' : C.border) }}>
                    ✗ No
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid ' + C.border }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: C.card, borderBottom: '1px solid ' + C.border }}>
          <h2 className="font-medium text-white">At-risk customers ({customers.length})</h2>
          <a href="/dashboard/winback" className="text-xs" style={{ color: '#1D9E75' }}>Run winback →</a>
        </div>
        {customers.length === 0 ? (
          <div className="px-5 py-12 text-center" style={{ background: '#0d0d14', color: C.muted }}><p className="text-sm">No at-risk customers. Great retention! 🎉</p></div>
        ) : (
          <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Name','Last Visit','Days Ago','Spend','Score'].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-medium" style={{ color: C.muted }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, 20).map(c => {
                const s = churnScore(c);
                const col = scoreColor(s);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-5 py-3 text-white">{c.name}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: '#9ca3af' }}>{c.last_visit ? new Date(c.last_visit).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3 text-xs font-medium" style={{ color: (daysAgo(c.last_visit) ?? 0) > 90 ? C.red : C.amber }}>{daysAgo(c.last_visit) ?? '—'}d</td>
                    <td className="px-5 py-3 text-xs" style={{ color: '#9ca3af' }}>A${(c.total_spend ?? 0).toFixed(0)}</td>
                    <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{ background: col + '20', color: col }}>{s}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
