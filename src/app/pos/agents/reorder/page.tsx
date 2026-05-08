'use client';
import { useState, useEffect, useCallback } from 'react';
import { track } from '@/lib/analytics';

interface POLine { product_id: string; product_name: string; qty: number; unit_cost: number; total: number; urgency: number; }
interface Decision {
  id: string; reasoning: string; projected_impact_cents: number; confidence_score: number;
  created_at: string; status: string;
  decision_data: { supplier_name: string; supplier_email: string | null; lines: POLine[]; total_cost: number; };
}

const urgencyColor = (u: number) => u > 0.8 ? '#F87171' : u > 0.5 ? '#FBBF24' : '#34D399';
const urgencyLabel = (u: number) => u > 0.8 ? 'Critical' : u > 0.5 ? 'Soon' : 'Planned';
const relTime = (d: string) => { const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return days === 0 ? 'Today' : `${days}d ago`; };

export default function ReorderAgentPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [lastRun, setLastRun] = useState<{ started_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/pos/agents/reorder?status=pending').then(r => r.json()).then(d => {
      setDecisions(d.decisions ?? []);
      setLastRun(d.last_run ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch('/api/pos/agents/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_now' }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Run failed');
      const n = (data.decisions ?? []).length;
      setToast({ message: n > 0 ? `Aria found ${n} decision${n !== 1 ? 's' : ''}` : 'Stock check complete — nothing to reorder', ok: true });
    } catch {
      setToast({ message: 'Run failed — check logs', ok: false });
    } finally {
      setRunning(false);
      load();
      setTimeout(() => setToast(null), 3500);
    }
  }

  async function doAction(id: string, action: 'approve' | 'reject' | 'snooze') {
    setActionLoading(id);
    await fetch('/api/pos/agents/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, decision_id: id }) });
    const dec = decisions.find(d => d.id === id);
    track(`agent_decision_${action}`, { agent_type: 'reorder', projected_impact_cents: dec?.projected_impact_cents ?? 0 });
    setActionLoading(null);
    setConfirmId(null);
    load();
  }

  const totalValue = decisions.reduce((s, d) => s + (d.decision_data?.total_cost ?? 0), 0);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📦 Aria Reorder</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {decisions.length > 0 ? `${decisions.length} pending PO${decisions.length > 1 ? 's' : ''} · A$${totalValue.toFixed(0)} total` : 'No pending purchase orders'}
          </p>
        </div>
        <button onClick={runNow} disabled={running} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: running ? 'var(--bg-elevated)' : 'var(--violet)', color: running ? 'var(--text-tertiary)' : '#fff', fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          {running ? <><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--violet)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} /> Running…</> : '⚡ Run now'}
        </button>
      </div>

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 120, background: 'var(--bg-surface)', borderRadius: 14, marginBottom: 12 }} />)
      ) : decisions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
            Stock levels look healthy
          </h3>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 14, maxWidth: 360, margin: '0 auto' }}>
            Aria checked your inventory — nothing needs reordering right now.
            She&apos;ll notify you when stock drops below reorder points.
          </p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 8 }}>
            Last checked: {lastRun ? new Date(lastRun.started_at).toLocaleString('en-AU') : 'Not run yet'}
          </p>
          <button onClick={runNow} style={{
            marginTop: 20, padding: '10px 20px',
            background: 'var(--violet)', color: '#fff',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          }}>
            ⚡ Check now
          </button>
        </div>
      ) : (
        decisions.map(d => {
          const data = d.decision_data;
          const isOpen = expanded.has(d.id);
          const topUrgency = data.lines?.reduce((m, l) => l.urgency > m ? l.urgency : m, 0) ?? 0;
          return (
            <div key={d.id} style={{ background: 'var(--bg-surface)', borderRadius: 14, marginBottom: 14, overflow: 'hidden', border: `1px solid ${urgencyColor(topUrgency)}30`, boxShadow: 'var(--shadow-card)' }}>
              {/* Header */}
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{data.supplier_name}</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${urgencyColor(topUrgency)}22`, color: urgencyColor(topUrgency), fontWeight: 700 }}>{urgencyLabel(topUrgency)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.lines?.length ?? 0} lines · A$${(data.total_cost ?? 0).toFixed(2)} total · {relTime(d.created_at)}</div>
                </div>
              </div>

              {/* Aria reasoning */}
              {d.reasoning && (
                <div style={{ margin: '0 20px 12px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 10, padding: '10px 14px' }}>
                  <span style={{ fontSize: 13 }}>✨ </span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{d.reasoning}</span>
                </div>
              )}

              {/* Top lines preview */}
              <div style={{ margin: '0 20px' }}>
                {(data.lines ?? []).slice(0, isOpen ? 100 : 3).map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: i > 0 ? '1px solid var(--divider)' : 'none', fontSize: 13 }}>
                    <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 500 }}>{l.product_name}</span>
                    <span style={{ color: 'var(--text-secondary)', marginRight: 16 }}>{l.qty} units</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-primary)' }}>A${l.total.toFixed(2)}</span>
                    <span style={{ marginLeft: 10, fontSize: 10, padding: '2px 6px', borderRadius: 99, background: `${urgencyColor(l.urgency)}22`, color: urgencyColor(l.urgency), fontWeight: 700 }}>{urgencyLabel(l.urgency)}</span>
                  </div>
                ))}
                {(data.lines?.length ?? 0) > 3 && (
                  <button onClick={() => setExpanded(s => { const n = new Set(s); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })} style={{ fontSize: 12, color: 'var(--violet)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', fontFamily: 'inherit' }}>
                    {isOpen ? '▲ Show less' : `▼ View all ${data.lines.length} lines`}
                  </button>
                )}
              </div>

              {/* Action footer */}
              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--divider)', display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmId(d.id)} disabled={actionLoading === d.id} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#34D399', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Approve & Send
                </button>
                <button onClick={() => doAction(d.id, 'snooze')} disabled={actionLoading === d.id} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Snooze 7d
                </button>
                <button onClick={() => doAction(d.id, 'reject')} disabled={actionLoading === d.id} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#F87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Reject
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* Confirm modal */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, background: toast.ok ? '#34D399' : '#F87171', color: '#000', padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', maxWidth: 300 }}>
          {toast.message}
        </div>
      )}

      {confirmId && (() => {
        const dec = decisions.find(d => d.id === confirmId);
        if (!dec) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Send PO to {dec.decision_data.supplier_name}?</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                A$${dec.decision_data.total_cost.toFixed(2)} · {dec.decision_data.lines?.length} lines
              </p>
              {dec.decision_data.supplier_email && (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>Will email to: {dec.decision_data.supplier_email}</p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={() => doAction(confirmId, 'approve')} style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: '#34D399', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Send PO
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
