'use client';
import { useState, useEffect, useCallback } from 'react';
import { track } from '@/lib/analytics';

interface PricingData { product_id: string; product_name: string; current_price: number; suggested_price: number; direction: 'drop' | 'lift'; focus: string; market: { median: number; p25: number; p75: number; position_pct: number }; velocity: { recent_14d: number; trend_pct: number }; }
interface Decision { id: string; reasoning: string; projected_impact_cents: number; confidence_score: number; created_at: string; status: string; decision_data: PricingData; }

export default function PricingAgentPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/pos/agents/pricing?status=pending').then(r => r.json()).then(d => {
      setDecisions(d.decisions ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true);
    await fetch('/api/pos/agents/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_now' }) });
    setRunning(false); load();
  }

  async function doAction(id: string, action: 'approve' | 'reject' | 'snooze') {
    setActionLoading(id);
    await fetch('/api/pos/agents/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, decision_id: id }) });
    const dec = decisions.find(d => d.id === id);
    track(`agent_decision_${action}`, { agent_type: 'pricing', projected_impact_cents: dec?.projected_impact_cents ?? 0 });
    setActionLoading(null); setConfirmId(null); load();
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>💰 Aria Pricing</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {decisions.length > 0 ? `${decisions.length} price suggestion${decisions.length > 1 ? 's' : ''} waiting` : 'No pricing suggestions'}
          </p>
        </div>
        <button onClick={runNow} disabled={running} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: running ? 'var(--bg-elevated)' : 'var(--violet)', color: running ? 'var(--text-tertiary)' : '#fff', fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {running ? 'Running…' : '⚡ Run now'}
        </button>
      </div>

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 140, background: 'var(--bg-surface)', borderRadius: 14, marginBottom: 12 }} />)
      ) : decisions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>All prices look optimal</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360, margin: '0 auto' }}>Aria checks prices daily at 7am AEST against competitor data.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
          {decisions.map(d => {
            const data = d.decision_data;
            const isDrop = data.direction === 'drop';
            const accentColor = isDrop ? '#FBBF24' : '#34D399';
            const delta = data.suggested_price - data.current_price;
            const impact = Math.abs(d.projected_impact_cents);

            return (
              <div key={d.id} style={{ background: 'var(--bg-surface)', borderRadius: 14, overflow: 'hidden', border: `1px solid ${accentColor}30`, boxShadow: 'var(--shadow-card)' }}>
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{data.product_name}</div>

                  {/* Price change */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-tertiary)', textDecoration: 'line-through', fontFamily: "'JetBrains Mono',monospace" }}>A${data.current_price.toFixed(2)}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>→</span>
                    <span style={{ fontSize: 28, fontWeight: 900, color: accentColor, fontFamily: "'JetBrains Mono',monospace" }}>A${data.suggested_price.toFixed(2)}</span>
                    <span style={{ fontSize: 12, color: accentColor, fontWeight: 700 }}>{isDrop ? '▼' : '▲'} {Math.abs(delta).toFixed(2)}</span>
                  </div>

                  {/* Market chips */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {[['P25', data.market?.p25], ['Med', data.market?.median], ['P75', data.market?.p75]].map(([l, v]) => (
                      <div key={l as string} style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>{l}: </span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>A${(v as number).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Velocity */}
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                    {data.velocity?.recent_14d} units / 14d
                    <span style={{ marginLeft: 6, color: (data.velocity?.trend_pct ?? 0) >= 0 ? '#34D399' : '#F87171' }}>
                      {(data.velocity?.trend_pct ?? 0) >= 0 ? '↑' : '↓'} {Math.abs((data.velocity?.trend_pct ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Aria reasoning */}
                  {d.reasoning && (
                    <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.16)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>✨ {d.reasoning}</span>
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Projected impact: <span style={{ color: accentColor, fontWeight: 700 }}>{isDrop ? '-' : '+'}A${(impact / 100).toFixed(0)}/week</span> · Confidence: {(d.confidence_score * 100).toFixed(0)}%
                  </div>
                </div>

                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--divider)', display: 'flex', gap: 6 }}>
                  <button onClick={() => setConfirmId(d.id)} disabled={actionLoading === d.id} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: accentColor, color: accentColor === '#FBBF24' ? '#000' : '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✓ Approve
                  </button>
                  <button onClick={() => doAction(d.id, 'snooze')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Snooze</button>
                  <button onClick={() => doAction(d.id, 'reject')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#F87171', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✗</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmId && (() => {
        const dec = decisions.find(d => d.id === confirmId);
        if (!dec) return null;
        const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-AU');
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, maxWidth: 380, boxShadow: 'var(--shadow-lg)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Apply new price?</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                Set <strong>{dec.decision_data.product_name}</strong> to <strong>A${dec.decision_data.suggested_price.toFixed(2)}</strong> effective {tomorrow}.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={() => doAction(confirmId, 'approve')} style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: '#34D399', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Apply price</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
