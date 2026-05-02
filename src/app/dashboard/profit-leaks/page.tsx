'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { AriaIntelligencePanel } from '@/components/dashboard/AriaIntelligencePanel';

interface Leak {
  id: string; type: string; title: string; description: string;
  estimated_monthly_impact_cents: number; priority: 'critical' | 'high' | 'medium';
  action: string; action_type: string; action_href: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  dead_stock: '📦', discounting: '🏷️', stockout: '🚫',
  expiry_risk: '⏰', slow_days: '📉', below_cost: '⚠️',
};
const PRIORITY_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.25)' },
  high:     { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  medium:   { bg: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
};

export default function ProfitLeaksPage() {
  const { business } = useBusinessContext();
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [discovery, setDiscovery] = useState('');
  const [totalCents, setTotalCents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/aria/profit-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');
      setLeaks(data.leaks ?? []);
      setAiSummary(data.ai_summary ?? '');
      setDiscovery(data.discovery ?? '');
      setTotalCents(data.total_monthly_impact_cents ?? 0);
      setLastRun(new Date().toISOString());
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [business?.id]);

  // Auto-run on load
  useEffect(() => { run(); }, [run]);

  const sorted = [...leaks].sort((a, b) => b.estimated_monthly_impact_cents - a.estimated_monthly_impact_cents);

  if (loading && leaks.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-64" />
        <div className="h-4 bg-[rgba(255,255,255,0.04)] rounded w-96" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl" />)}
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[rgba(255,255,255,0.04)] rounded-xl" />)}
        </div>
        <p className="text-sm text-center pt-4" style={{ color: '#6b7280' }}>
          Aria is analysing your data — checking dead stock, discounting, stockouts, slow days…
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Profit Leaks</h1>
          <p style={{ color: '#6b7280' }}>Aria found these areas where your business is losing money</p>
          {lastRun && <p className="text-xs mt-1" style={{ color: '#4b5563' }}>Last analysed: {new Date(lastRun).toLocaleString()}</p>}
        </div>
        <button onClick={run} disabled={loading}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 flex items-center gap-2"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
          {loading ? <><span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />Analysing…</> : '↻ Refresh'}
        </button>
      </div>

      {/* Discovery moment — Aria's key finding */}
      {discovery && !loading && (
        <div className="mb-6 rounded-2xl p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg,rgba(29,158,117,0.12),rgba(29,158,117,0.05))', border: '1px solid rgba(29,158,117,0.25)' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1D9E75] flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-sm font-bold">A</span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[#1D9E75] mb-2">Aria found something</p>
              <p className="text-sm leading-relaxed text-white/80">{discovery}</p>
            </div>
          </div>
        </div>
      )}

      <AriaIntelligencePanel mode="profit" />

      {error && (
        <div className="mb-4 rounded-xl px-5 py-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p className="text-sm font-medium text-red-400">Something went wrong</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(239,68,68,0.6)' }}>{error}</p>
          <button onClick={run} className="text-xs text-red-400 underline mt-2">Try again</button>
        </div>
      )}

      {/* AI summary banner */}
      {aiSummary && (
        <div className="mb-6 rounded-xl p-5" style={{
          background: totalCents > 100000 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.07)',
          border: `1px solid ${totalCents > 100000 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
        }}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: '#1D9E75' }} className="text-sm font-medium">✦ Aria's Analysis</span>
            {totalCents > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                A${(totalCents / 100).toFixed(0)}/month at risk
              </span>
            )}
          </div>
          <p className="text-sm" style={{ color: '#d1d5db' }}>{aiSummary}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Est. monthly loss', value: `A$${(totalCents / 100).toFixed(0)}`, color: totalCents > 0 ? '#ef4444' : '#1D9E75' },
          { label: 'Active leaks', value: leaks.filter(l => l.priority !== 'medium').length, color: '#fff' },
          { label: 'Critical', value: leaks.filter(l => l.priority === 'critical').length, color: leaks.some(l => l.priority === 'critical') ? '#ef4444' : '#fff' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{stat.label}</p>
            <p className="text-2xl font-semibold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Leaks */}
      {sorted.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-3xl mb-3">🎉</div>
          <p className="font-semibold text-white mb-1">No significant profit leaks detected</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Your business looks healthy. Keep recording sales for more accurate analysis.
          </p>
          <p className="text-xs mt-2" style={{ color: '#4b5563' }}>
            Aria checks dead stock, discounting, stockouts, slow days, expiry risk, and below-cost pricing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(leak => {
            const ps = PRIORITY_STYLES[leak.priority] ?? PRIORITY_STYLES.medium;
            return (
              <div key={leak.id} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{TYPE_ICONS[leak.type] ?? '💰'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-white text-sm">{leak.title}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                          style={{ background: ps.bg, color: ps.color, border: `1px solid ${ps.border}` }}>
                          {leak.priority}
                        </span>
                      </div>
                      <p className="text-sm font-semibold shrink-0" style={{ color: '#ef4444' }}>
                        ~A${(leak.estimated_monthly_impact_cents / 100).toFixed(0)}/mo
                      </p>
                    </div>
                    <p className="text-sm mb-3" style={{ color: '#9ca3af' }}>{leak.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs px-3 py-1.5 rounded-lg flex-1" style={{ background: 'rgba(29,158,117,0.08)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.15)' }}>
                        💡 {leak.action}
                      </p>
                      {leak.action_href && (
                        <a href={leak.action_href}
                          onClick={() => {
                            fetch('/api/aria/outcomes', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                recommendation_type: 'profit_leak_action',
                                recommendation_detail: `${leak.title}: ${leak.action}`,
                                acted_on: true,
                                outcome_value_cents: leak.estimated_monthly_impact_cents,
                              }),
                            }).catch(() => null);
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg shrink-0 transition-colors hover:opacity-80"
                          style={{ background: '#1D9E75', color: '#fff' }}>
                          Fix it →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
