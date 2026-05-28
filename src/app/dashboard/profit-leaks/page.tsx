'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { AriaIntelligencePanel } from '@/components/dashboard/AriaIntelligencePanel';

interface Leak {
  id: string; title: string; category: string; description: string;
  monthly_loss: number; estimated_loss: number;
  recommendation: string; fix_suggestion: string; status: string;
}

interface HistoryPoint { run_at: string; total_leak_cents: number; fixed_count: number }

const LEAK_CATEGORIES: Record<string, { label: string; icon: string; color: string; bg: string; matches: string[] }> = {
  pricing_gap: { label: 'Pricing Gaps', icon: '🔴', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', matches: ['pricing', 'price', 'below_cost', 'discounting', 'discount', 'margin'] },
  waste:       { label: 'Waste & Shrinkage', icon: '🟠', color: '#F97316', bg: 'rgba(249,115,22,0.08)', matches: ['waste', 'shrinkage', 'dead_stock', 'expiry', 'stock_variance', 'inventory'] },
  labour:      { label: 'Labour Inefficiency', icon: '🟡', color: '#EAB308', bg: 'rgba(234,179,8,0.08)', matches: ['labour', 'labor', 'staff', 'slow_day', 'overtime', 'overstaffed'] },
  lost_sales:  { label: 'Lost Sales', icon: '🔵', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', matches: ['stockout', 'out_of_stock', 'lost_sale', 'demand', 'shortage'] },
  churn:       { label: 'Customer Churn Cost', icon: '🟣', color: '#A855F7', bg: 'rgba(168,85,247,0.08)', matches: ['churn', 'retention', 'lost_customer', 'customer', 'returning'] },
}

function getCatKey(category: string): string {
  const cat = (category ?? '').toLowerCase()
  for (const [key, cfg] of Object.entries(LEAK_CATEGORIES)) {
    if (cfg.matches.some(m => cat.includes(m))) return key
  }
  return 'waste'
}

function fmtAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) !== 1 ? 's' : ''} ago`
}

export default function ProfitLeaksPage() {
  const { business } = useBusinessContext();
  const router = useRouter();
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    let cancelled = false;
    async function init() {
      setLoading(true);
      try {
        const res = await fetch(`/api/aria/profit-analysis?business_id=${business!.id}`);
        const d = await res.json();
        if (cancelled) return;
        setLeaks(d.leaks ?? []);
        setHistory(d.history ?? []);
        if (d.last_run_at) setLastRunAt(d.last_run_at);
        setLoading(false);
        const stale = !d.last_run_at || Date.now() - new Date(d.last_run_at).getTime() > 24 * 3600_000;
        if (stale) {
          const pr = await fetch('/api/aria/profit-analysis', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: business!.id }),
          });
          const pd = await pr.json();
          if (!cancelled) {
            if (pd.leaks) setLeaks(pd.leaks);
            if (pd.history) setHistory(pd.history);
            if (pd.ai_summary) setAiSummary(pd.ai_summary);
            setLastRunAt(new Date().toISOString());
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [business?.id]);

  async function runRefresh() {
    if (!business?.id) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/aria/profit-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      });
      const d = await res.json();
      if (d.leaks) setLeaks(d.leaks);
      if (d.history) setHistory(d.history);
      if (d.ai_summary) setAiSummary(d.ai_summary);
      setLastRunAt(new Date().toISOString());
    } catch { /* ignore */ }
    setRefreshing(false);
  }

  async function markFixed(id: string) {
    await fetch('/api/aria/profit-analysis', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, business_id: business?.id }),
    }).catch(() => null);
    setLeaks(prev => prev.map(l => l.id === id ? { ...l, status: 'fixed' } : l));
    setHistory(prev => {
      if (!prev.length) return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], fixed_count: (updated[0].fixed_count ?? 0) + 1 };
      return updated;
    });
  }

  const activeLeaks = leaks.filter(l => l.status !== 'fixed');
  const fixedLeaks = leaks.filter(l => l.status === 'fixed');
  const totalLoss = activeLeaks.reduce((s, l) => s + (Number(l.monthly_loss) || 0), 0);
  const fixedSavings = fixedLeaks.reduce((s, l) => s + (Number(l.monthly_loss) || 0), 0);

  const byCategory = Object.entries(LEAK_CATEGORIES).map(([key, cfg]) => {
    const items = activeLeaks.filter(l => getCatKey(l.category) === key);
    return { key, cfg, items, total: items.reduce((s, l) => s + (Number(l.monthly_loss) || 0), 0) };
  }).filter(c => c.items.length > 0);

  const chartData = [...history].reverse().map(h => ({
    date: new Date(h.run_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }),
    leaks: Math.round((h.total_leak_cents ?? 0) / 100),
  }));

  const trend = history.length >= 2
    ? Math.round(((history[history.length - 1].total_leak_cents - history[0].total_leak_cents) / Math.max(history[history.length - 1].total_leak_cents, 1)) * 100)
    : null;

  if (loading && leaks.length === 0) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: 800 }}>
        <div style={{ height: 28, background: 'rgba(255,255,255,0.06)', borderRadius: 10, width: 260, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 72, background: 'rgba(255,255,255,0.04)', borderRadius: 12 }} />)}
        </div>
        {[1,2,3,4].map(i => <div key={i} style={{ height: 100, background: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 10 }} />)}
        <p style={{ fontSize: 12, color: 'var(--text-secondary, rgba(255,255,255,0.55))', textAlign: 'center', marginTop: 16 }}>Aria is analysing your data…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Profit Leaks</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Aria identified these areas where your business is losing money.</p>
          {lastRunAt && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Last updated: {fmtAgo(lastRunAt)}</p>}
        </div>
        <button onClick={runRefresh} disabled={refreshing}
          style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.06)', color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: refreshing ? 0.6 : 1 }}>
          {refreshing ? 'Analysing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Fix rate banner */}
      {leaks.length > 0 && (
        <div style={{ background: fixedLeaks.length > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (fixedLeaks.length > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'), borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: fixedLeaks.length > 0 ? '#22C55E' : 'var(--text-primary)' }}>
            {fixedLeaks.length > 0
              ? `✅ You've fixed ${fixedLeaks.length} of ${leaks.length} leaks — saving an estimated $${fixedSavings.toFixed(0)}/month`
              : `${leaks.length} profit leak${leaks.length !== 1 ? 's' : ''} identified`}
          </span>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
            Est. monthly loss: <strong style={{ color: '#EF4444', fontSize: 16 }}>${totalLoss.toFixed(0)}</strong>
          </div>
        </div>
      )}

      {/* Category summary cards */}
      {byCategory.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
          {byCategory.map(({ key, cfg, items, total }) => (
            <div key={key} style={{ background: cfg.bg, border: '1px solid ' + cfg.color + '30', borderRadius: 12, padding: '12px 16px', minWidth: 148, flexShrink: 0 }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{cfg.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, marginBottom: 4 }}>{cfg.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{items.length} leak{items.length !== 1 ? 's' : ''}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>${total.toFixed(0)}/mo</div>
            </div>
          ))}
        </div>
      )}

      {/* History chart */}
      {chartData.length > 1 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Leak Trend (last 30 days)</span>
            {trend !== null && Math.abs(trend) > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: trend > 0 ? '#22C55E' : '#EF4444' }}>
                {trend > 0 ? '↓' : '↑'} {Math.abs(trend)}% {trend > 0 ? 'improvement this month' : 'increase this month'}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `$${v}`} />
              <Tooltip formatter={(v) => [`$${v}`, 'Monthly leaks']} contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="leaks" stroke="#EF4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {aiSummary && (
        <div style={{ marginBottom: 20, borderRadius: 14, padding: 18, background: 'linear-gradient(135deg,rgba(29,158,117,0.12),rgba(29,158,117,0.05))', border: '1px solid rgba(29,158,117,0.25)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>✦ Aria's Analysis</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, margin: 0 }}>{aiSummary}</p>
        </div>
      )}

      <AriaIntelligencePanel mode="profit" />

      {/* Leak cards */}
      {activeLeaks.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', marginTop: 8 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No significant profit leaks detected</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Keep recording sales for more accurate analysis.</p>
        </div>
      ) : (
        byCategory.map(({ key, cfg, items }) => (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>{cfg.icon}</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: cfg.color, margin: 0 }}>{cfg.label}</h2>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, fontWeight: 700 }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(leak => (
                <div key={leak.id} style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{leak.title}</p>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#EF4444', flexShrink: 0 }}>${(Number(leak.monthly_loss) || 0).toFixed(0)}/mo</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>{leak.description}</p>
                  {leak.recommendation && (
                    <p style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(29,158,117,0.08)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.15)', marginBottom: 12 }}>
                      💡 {leak.recommendation}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => router.push(`/dashboard/ask-aria?q=${encodeURIComponent('How do I fix: ' + leak.title)}`)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: '#1D9E75', color: '#fff', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Fix with Aria →
                    </button>
                    <button onClick={() => markFixed(leak.id)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, rgba(255,255,255,0.55))', fontSize: 11, fontWeight: 700, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      ✓ Mark as fixed
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Fixed leaks section */}
      {fixedLeaks.length > 0 && (
        <div style={{ marginTop: 8, opacity: 0.5 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>Fixed ({fixedLeaks.length})</p>
          {fixedLeaks.map(leak => (
            <div key={leak.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: '#22C55E' }}>✅</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'line-through' }}>{leak.title}</span>
              <span style={{ fontSize: 11, color: '#22C55E', marginLeft: 'auto' }}>+${(Number(leak.monthly_loss) || 0).toFixed(0)}/mo saved</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
