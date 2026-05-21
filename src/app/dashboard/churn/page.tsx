'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface ChurnCustomer { id: string; name: string; last_visit: string | null; total_spend: number | null; visit_count: number | null; churn_risk: string | null; rfm_recency_score: number | null; rfm_frequency_score: number | null; segment: string | null; }
interface Promotion { promotion_name: string; offer_text: string; sms_message: string; recommended_time_to_send: string; rationale: string; }

const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function daysAgo(date: string | null) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

export default function ChurnPage() {
  const { business } = useBusinessContext();
  const [customers, setCustomers] = useState<ChurnCustomer[]>([]);
  const [slowDayData, setSlowDayData] = useState<{ day: string; avg: number; pct: number }[]>([]);
  const [slowestDay, setSlowestDay] = useState<string | null>(null);
  const [insufficientData, setInsufficientData] = useState(false);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [generatingPromo, setGeneratingPromo] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);

    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

    const [custRes, slowDayRes] = await Promise.all([
      fetch(`/api/customers?business_id=${business.id}&lapsed=30`).then(r => r.json()).catch(() => ({ customers: [] })),
      fetch(`/api/aria/slow-day-analysis?business_id=${business.id}`).then(r => r.json()).catch(() => ({ days: [], insufficient_data: true })),
    ]);

    setCustomers(custRes.customers ?? []);

    if (slowDayRes.insufficient_data || !slowDayRes.days?.length) {
      setInsufficientData(true);
    } else {
      setSlowDayData(slowDayRes.days);
      const slowest = slowDayRes.days.sort((a: any, b: any) => a.avg - b.avg)[0];
      setSlowestDay(slowest?.day ?? null);
      setInsufficientData(false);
    }
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function generatePromotion() {
    if (!business?.id) return;
    setGeneratingPromo(true);
    const res = await fetch('/api/aria/generate-promotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        context: { slowest_day: slowestDay, insufficient_data: insufficientData },
      }),
    }).then(r => r.json()).catch(() => null);
    if (res) setPromotion(res);
    setGeneratingPromo(false);
  }

  const at_risk = customers.filter(c => { const d = daysAgo(c.last_visit); return d !== null && d >= 30 && d < 60; });
  const lapsed = customers.filter(c => { const d = daysAgo(c.last_visit); return d !== null && d >= 60 && d < 90; });
  const lost = customers.filter(c => { const d = daysAgo(c.last_visit); return d !== null && d >= 90; });
  const highRisk = customers.filter(c => c.churn_risk === 'high' || c.churn_risk === 'churned');

  function riskBadge(c: ChurnCustomer) {
    const d = daysAgo(c.last_visit);
    if (d === null) return { label: 'Unknown', style: { background: 'rgba(255,255,255,0.06)', color: '#9ca3af' } };
    if (d >= 90) return { label: 'Lost', style: { background: 'rgba(239,68,68,0.15)', color: '#ef4444' } };
    if (d >= 60) return { label: 'Lapsed', style: { background: 'rgba(249,115,22,0.15)', color: '#f97316' } };
    return { label: 'At Risk', style: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' } };
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="grid grid-cols-3 gap-4"><div className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl col-span-3" /></div>
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  const maxAvg = slowDayData.length ? Math.max(...slowDayData.map(d => d.avg)) : 1;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Churn & Slow Days</h1>
        <p style={{ color: '#6b7280' }}>Customers at risk and your slowest revenue periods</p>
      </div>

      {/* Churn stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'At risk (30-60d)', value: at_risk.length, color: '#fbbf24' },
          { label: 'Lapsed (60-90d)', value: lapsed.length, color: '#f97316' },
          { label: 'Lost (90d+)', value: lost.length, color: '#ef4444' },
          { label: 'High churn risk', value: highRisk.length, color: highRisk.length > 0 ? '#ef4444' : '#1D9E75' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
            <p className="text-2xl font-semibold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Slow day chart */}
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-medium text-white text-sm">Revenue by day of week</h2>
              <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Last 90 days average</p>
            </div>
            <button onClick={generatePromotion} disabled={generatingPromo}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1"
              style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
              {generatingPromo ? 'Generating…' : '✦ Create promo'}
            </button>
          </div>
          {insufficientData ? (
            <div className="py-6 text-center">
              <p className="text-sm" style={{ color: '#6b7280' }}>Insufficient data</p>
              <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Record at least 30 days of sales to see slow day analysis.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {slowDayData.sort((a, b) => DOW.indexOf(a.day) - DOW.indexOf(b.day)).map(d => {
                const isSlowest = d.day === slowestDay;
                const barPct = maxAvg > 0 ? (d.avg / maxAvg) * 100 : 0;
                return (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="text-xs w-20 shrink-0" style={{ color: isSlowest ? '#ef4444' : '#9ca3af' }}>{d.day.slice(0, 3)}</span>
                    <div className="flex-1 h-5 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-lg transition-all" style={{ width: `${barPct}%`, background: isSlowest ? '#ef4444' : '#1D9E75' }} />
                    </div>
                    <span className="text-xs w-16 text-right shrink-0" style={{ color: isSlowest ? '#ef4444' : '#9ca3af' }}>
                      A${(d.avg / 100).toFixed(0)}
                    </span>
                    {isSlowest && <span className="text-xs shrink-0" style={{ color: '#ef4444' }}>↓ slowest</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Promotion card */}
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-medium text-white text-sm mb-3">Slow Day Promotion</h2>
          {promotion ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Promotion name</p>
                <p className="text-sm font-medium text-white">{promotion.promotion_name}</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Offer</p>
                <p className="text-sm text-white">{promotion.offer_text}</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: '#6b7280' }}>SMS message</p>
                <div className="px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: '#d1d5db' }}>
                  {promotion.sms_message}
                </div>
                <button onClick={() => navigator.clipboard.writeText(promotion.sms_message)} className="text-xs mt-1" style={{ color: '#1D9E75' }}>Copy SMS</button>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Send time</p>
                <p className="text-sm text-white">{promotion.recommended_time_to_send}</p>
              </div>
              <p className="text-xs italic" style={{ color: '#6b7280' }}>{promotion.rationale}</p>
              <button onClick={generatePromotion} className="text-xs" style={{ color: '#4b5563' }}>↻ Regenerate</button>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: '#6b7280' }}>
                {insufficientData ? 'Add more sales data to generate a targeted promotion.' : `Click "Create promo" to generate a targeted offer for ${slowestDay ?? 'your slowest day'}.`}
              </p>
              {!insufficientData && (
                <button onClick={generatePromotion} disabled={generatingPromo}
                  className="mt-3 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: '#1D9E75' }}>
                  {generatingPromo ? 'Generating…' : '✦ Generate with Aria'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>


      {/* RFM Customer Map */}
      {customers.some(c => c.rfm_recency_score != null) && (
        <div className="rounded-xl p-5 mb-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-medium text-white text-sm mb-3">Customer Health Map</h2>
          <div style={{ position: 'relative', height: 160, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 12 }}>
            {customers.filter(c => c.rfm_recency_score != null && c.rfm_frequency_score != null).map(c => {
              const x = ((c.rfm_recency_score ?? 1) / 5) * 88 + 6
              const y = (1 - (c.rfm_frequency_score ?? 1) / 5) * 88 + 6
              const score = (c.rfm_recency_score ?? 0) + (c.rfm_frequency_score ?? 0)
              const dotColor = score >= 8 ? '#22C55E' : score >= 5 ? '#F59E0B' : '#EF4444'
              return (<div key={c.id} title={c.name} style={{ position: 'absolute', left: x+'%', top: y+'%', width: 7, height: 7, borderRadius: '50%', background: dotColor, transform: 'translate(-50%,-50%)', opacity: 0.85 }} />)
            })}
            <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 9, color: '#374151' }}>recency →</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[{key:'champion',label:'Champions',color:'#22C55E'},{key:'at_risk',label:'At Risk',color:'#F59E0B'},{key:'lost',label:'Lost',color:'#EF4444'}].map(s => (
              <div key={s.key} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                <p className="text-xs font-semibold mb-0.5" style={{ color: s.color }}>{s.label}</p>
                <p className="text-xl font-bold text-white">{customers.filter(c => c.segment === s.key).length}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-medium text-white">At-risk customers ({customers.length})</h2>
          <a href="/dashboard/winback" className="text-xs" style={{ color: '#1D9E75' }}>Run winback campaign →</a>
        </div>
        {customers.length === 0 ? (
          <div className="px-5 py-12 text-center" style={{ background: '#0d0d14', color: '#6b7280' }}>
            <p className="text-sm">No at-risk customers. Great retention! 🎉</p>
          </div>
        ) : (
          <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Name', 'Last Visit', 'Days Ago', 'Total Spend', 'Visits', 'Risk'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map(c => {
                const badge = riskBadge(c);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-5 py-3 text-white">{c.name}</td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>
                      {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-xs font-medium" style={{ color: (daysAgo(c.last_visit) ?? 0) > 90 ? '#ef4444' : '#f59e0b' }}>
                      {daysAgo(c.last_visit) ?? '—'}d
                    </td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>A${(c.total_spend ?? 0).toFixed(0)}</td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>{c.visit_count ?? 0}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs" style={badge.style}>{badge.label}</span>
                    </td>
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
