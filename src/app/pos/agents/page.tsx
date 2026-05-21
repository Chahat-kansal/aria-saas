'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { track } from '@/lib/analytics';

interface Decision { id: string; agent_type: string; reasoning: string; projected_impact_cents: number; confidence_score: number; created_at: string; status: string; decision_data: Record<string, unknown>; }
interface AgentSummary { type: string; label: string; icon: string; desc: string; href: string; pending: number; last_run: string | null; last_run_decisions: number; last_run_timed_out: boolean; enabled: boolean; }

function getTrustMessage(daysSince: number, decisionCount: number): string {
  if (daysSince < 7) return `Week 1: Every decision needs your approval. Aria is learning your business.`;
  if (daysSince < 30) return `Building trust: Aria has made ${decisionCount} decisions. Auto-approve under A$200 when ready.`;
  if (daysSince < 90) return 'Trusted: Set your auto-approve thresholds in Settings to run hands-free.';
  return 'Full autonomy available: Aria can run with daily summaries only. Set thresholds to enable.';
}

const impactFmt = (cents: number) => cents >= 0 ? `+A$${(cents / 100).toFixed(0)}` : `-A$${(Math.abs(cents) / 100).toFixed(0)}`;
const relTime = (d: string) => { const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return days === 0 ? 'Today' : `${days}d ago`; };

const AGENT_DEFS = [
  { type: 'reorder', label: 'Reorder Agent', icon: '📦', desc: 'Drafts purchase orders before stock runs out', href: '/pos/agents/reorder' },
  { type: 'pricing', label: 'Pricing Agent', icon: '💰', desc: 'Suggests price adjustments based on competitor data', href: '/pos/agents/pricing' },
  { type: 'schedule', label: 'Smart Schedule', icon: '📅', desc: 'Builds staff rosters matched to demand forecasts', href: '/pos/agents/schedule' },
];

const agentColor: Record<string, string> = { reorder: '#00B140', pricing: '#FBBF24', schedule: '#60A5FA' };
const agentColorDim: Record<string, string> = { reorder: 'rgba(52,211,153,0.12)', pricing: 'rgba(251,191,36,0.12)', schedule: 'rgba(96,165,250,0.12)' };
const sBtn = (c = '#006AFF', dim = 'rgba(0,106,255,0.08)'): React.CSSProperties => ({ padding: '6px 14px', borderRadius: 7, border: `1px solid ${c}40`, background: dim, color: c, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });

export default function AgentsDashboardPage() {
  const [summaries, setSummaries] = useState<AgentSummary[]>([]);
  const [allDecisions, setAllDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsDrawer, setSettingsDrawer] = useState<string | null>(null);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [settingsData, setSettingsData] = useState<Record<string, { enabled: boolean; auto_approve_below_cents: number }>>({});
  const [businessCreatedAt, setBusinessCreatedAt] = useState<string | null>(null);
  const [totalDecisionCount, setTotalDecisionCount] = useState(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [bizRes, ...results] = await Promise.all([
      fetch('/api/pos/business').then(r => r.json()).catch(() => null),
      ...AGENT_DEFS.map(a => fetch(`/api/pos/agents/${a.type}?status=pending`).then(r => r.json()).catch(() => ({ decisions: [], last_run: null, settings: null }))),
    ]);
    if (bizRes?.business?.created_at) setBusinessCreatedAt(bizRes.business.created_at);
    const allCount = await fetch('/api/pos/agents/all?status=all').then(r => r.json()).then(d => (d.decisions ?? []).length).catch(() => 0);
    setTotalDecisionCount(allCount);
    const sums: AgentSummary[] = AGENT_DEFS.map((a, i) => {
      const lr = results[i].last_run ?? null;
      const lrErrors = lr?.errors as Array<{ message?: string }> | null;
      const timedOut = Array.isArray(lrErrors) && lrErrors.some(e => (e?.message ?? '').includes('timeout'));
      return {
        ...a, pending: results[i].decisions?.length ?? 0,
        last_run: lr?.started_at ?? null,
        last_run_decisions: lr?.decisions_count ?? 0,
        last_run_timed_out: timedOut,
        enabled: results[i].settings?.enabled ?? true,
      };
    });
    setSummaries(sums);
    const flat: Decision[] = AGENT_DEFS.flatMap((_, i) => results[i].decisions ?? []);
    flat.sort((a, b) => Math.abs(b.projected_impact_cents) - Math.abs(a.projected_impact_cents));
    setAllDecisions(flat.slice(0, 20));
    setSettingsData(Object.fromEntries(AGENT_DEFS.map((a, i) => [a.type, { enabled: results[i].settings?.enabled ?? true, auto_approve_below_cents: results[i].settings?.auto_approve_below_cents ?? 0 }])));
    setLoading(false);
  }, []);

  useEffect(() => { document.title = 'AI Agents | Aria POS'; }, [])
  useEffect(() => { loadAll(); }, [loadAll]);

  async function doDecision(id: string, action: 'approve' | 'reject' | 'snooze', type: string) {
    const dec = allDecisions.find(d => d.id === id);
    await fetch(`/api/pos/agents/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, decision_id: id }) });
    track(`agent_decision_${action}` as string, { agent_type: type, projected_impact_cents: dec?.projected_impact_cents ?? 0 });
    loadAll();
  }

  async function runNow(type: string) {
    setRunningAgent(type);
    setRunResult(prev => ({ ...prev, [type]: { ok: true, msg: '' } }));
    try {
      const res = await fetch(`/api/pos/agents/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_now' }) });
      const data = await res.json();
      const n = (data.decisions ?? []).length;
      setRunResult(prev => ({
        ...prev,
        [type]: {
          ok: res.ok,
          msg: res.ok
            ? (n > 0 ? `${n} decision${n !== 1 ? 's' : ''} ready for review` : 'No action needed right now')
            : (data.error ?? 'Agent failed — check logs'),
        },
      }));
    } catch {
      setRunResult(prev => ({ ...prev, [type]: { ok: false, msg: 'Network error — please retry' } }));
    }
    setRunningAgent(null);
    loadAll();
    setTimeout(() => setRunResult(prev => { const next = { ...prev }; delete next[type]; return next; }), 5000);
  }

  async function saveSettings(type: string) {
    const s = settingsData[type];
    await fetch(`/api/pos/agents/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', ...s }) });
    setSettingsDrawer(null);
    loadAll();
  }

  const daysSinceBusiness = businessCreatedAt
    ? Math.floor((Date.now() - new Date(businessCreatedAt).getTime()) / (86400000))
    : 0;
  const trustMessage = getTrustMessage(daysSinceBusiness, totalDecisionCount);
  const trustIcon = daysSinceBusiness < 7 ? '🔒' : daysSinceBusiness < 30 ? '🌱' : daysSinceBusiness < 90 ? '✅' : '🤖';

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      {/* Trust ladder banner */}
      <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.14) 0%, rgba(167,139,250,0.07) 100%)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 12, padding: '12px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{trustIcon}</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>Trust mode:</strong> {trustMessage}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Aria Agents</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Autonomous decisions, waiting for your one-tap approval.</p>
        </div>
        <Link href="/pos/agents/activity" style={{ textDecoration: 'none' }}>
          <span style={{ ...sBtn('#94A3B8', 'rgba(148,163,184,0.10)'), padding: '8px 16px' }}>📋 Activity log</span>
        </Link>
      </div>

      {/* Agent cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14, marginBottom: 32 }}>
        {(loading ? AGENT_DEFS : summaries).map(a => {
          const color = agentColor[a.type] ?? '#006AFF';
          const dim = agentColorDim[a.type] ?? 'rgba(0,106,255,0.08)';
          const pending = (a as AgentSummary).pending ?? 0;
          return (
            <div key={a.type} style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '18px 20px', border: `1px solid ${color}30`, boxShadow: 'var(--shadow-card)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{a.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{a.desc}</div>
                  </div>
                </div>
                {pending > 0 && <span style={{ background: `${color}22`, color, fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>{pending} pending</span>}
              </div>
              {(a as AgentSummary).last_run && (
                <div style={{ fontSize: 11, color: (a as AgentSummary).last_run_timed_out ? '#FBBF24' : 'var(--text-tertiary)', marginBottom: 12 }}>
                  Last run: {relTime((a as AgentSummary).last_run!)} —{' '}
                  {(a as AgentSummary).last_run_timed_out
                    ? '⚠️ timed out'
                    : `completed (${(a as AgentSummary).last_run_decisions} decisions)`}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Link href={a.href} style={{ textDecoration: 'none' }}>
                  <span style={{ ...sBtn(color, dim) }}>View decisions</span>
                </Link>
                <button
                  style={{ ...sBtn(), opacity: runningAgent === a.type ? 0.6 : 1, cursor: runningAgent === a.type ? 'not-allowed' : 'pointer' }}
                  disabled={runningAgent === a.type}
                  onClick={() => runNow(a.type)}>
                  {runningAgent === a.type ? '⏳ Running…' : '⚡ Run now'}
                </button>
                {runResult[a.type] && (
                  <span style={{ fontSize: 11, color: runResult[a.type].ok ? '#00B140' : '#F87171', marginLeft: 4 }}>
                    {runResult[a.type].ok ? '✓' : '✗'} {runResult[a.type].msg}
                  </span>
                )}
                <button style={sBtn('#94A3B8', 'rgba(148,163,184,0.10)')} onClick={() => setSettingsDrawer(a.type)}>⚙ Settings</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unified decisions feed */}
      {allDecisions.length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>All pending decisions</h2>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['AGENT','DECISION','IMPACT','CONFIDENCE','CREATED',''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', background: '#006AFF', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDecisions.map((d, i) => (
                  <tr key={d.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: `${agentColor[d.agent_type] ?? '#006AFF'}22`, color: agentColor[d.agent_type] ?? '#006AFF', fontWeight: 700 }}>{d.agent_type}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-primary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(d.decision_data?.supplier_name as string) ?? (d.decision_data?.product_name as string) ?? (d.decision_data?.outlet_name as string) ?? 'Decision'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: d.projected_impact_cents >= 0 ? '#00B140' : '#FBBF24', fontFamily: "'JetBrains Mono',monospace" }}>
                      {impactFmt(d.projected_impact_cents)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 60, height: 5, borderRadius: 99, background: 'var(--bg-overlay)', overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ height: '100%', width: `${(d.confidence_score ?? 0) * 100}%`, background: (d.confidence_score ?? 0) >= 0.8 ? '#00B140' : (d.confidence_score ?? 0) >= 0.5 ? '#FBBF24' : '#F87171', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{((d.confidence_score ?? 0) * 100).toFixed(0)}%</span>
                      </div>
                      {(d.confidence_score ?? 0) < 0.5 && <div style={{ fontSize: 10, color: '#F87171', marginTop: 2 }}>⚠️ Review carefully</div>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-tertiary)' }}>{relTime(d.created_at)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => doDecision(d.id, 'approve', d.agent_type)} style={sBtn('#00B140', 'rgba(52,211,153,0.12)')}>✓ Approve</button>
                        <button onClick={() => doDecision(d.id, 'reject', d.agent_type)} style={sBtn('#F87171', 'rgba(248,113,113,0.12)')}>✗</button>
                        <button onClick={() => doDecision(d.id, 'snooze', d.agent_type)} style={sBtn('#94A3B8', 'rgba(148,163,184,0.10)')}>⏱</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && allDecisions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>No pending decisions</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360, margin: '0 auto 20px' }}>Agents run automatically each morning. Click ⚡ Run now on any agent to generate decisions immediately.</p>
        </div>
      )}

      {/* Settings drawer */}
      {settingsDrawer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }} onClick={() => setSettingsDrawer(null)} />
          <div style={{ width: 360, background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-lg)', padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{AGENT_DEFS.find(a => a.type === settingsDrawer)?.label} Settings</span>
              <button onClick={() => setSettingsDrawer(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={settingsData[settingsDrawer]?.enabled ?? true} onChange={e => setSettingsData(s => ({ ...s, [settingsDrawer]: { ...s[settingsDrawer], enabled: e.target.checked } }))} style={{ accentColor: 'var(--violet)', width: 16, height: 16 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Enabled</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Run automatically on schedule</div>
                </div>
              </label>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>Auto-approve decisions under (A$)</label>
                <input type="number" min={0} max={1000} value={(settingsData[settingsDrawer]?.auto_approve_below_cents ?? 0) / 100} onChange={e => setSettingsData(s => ({ ...s, [settingsDrawer]: { ...s[settingsDrawer], auto_approve_below_cents: Math.round(parseFloat(e.target.value) * 100) } }))} style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Set to 0 to require manual approval for all decisions.</div>
              </div>
              <button onClick={() => saveSettings(settingsDrawer)} style={{ padding: '10px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Save settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
