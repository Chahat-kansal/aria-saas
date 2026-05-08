'use client';
import { useState, useEffect, useCallback } from 'react';
import { track } from '@/lib/analytics';

interface ShiftRow { staff_id: string; staff_name: string; hour: number; day: string; hourly_rate_cents: number; reasoning: string; }
interface ScheduleData { outlet_id: string; outlet_name: string; week_start: string; shift_count: number; total_hours: number; total_cost_cents: number; }
interface Decision { id: string; reasoning: string; projected_impact_cents: number; confidence_score: number; created_at: string; status: string; decision_data: ScheduleData; }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ScheduleAgentPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/pos/agents/schedule?status=pending').then(r => r.json()).then(d => {
      setDecisions(d.decisions ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true);
    await fetch('/api/pos/agents/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_now' }) });
    setRunning(false); load();
  }

  async function doAction(id: string, action: 'approve' | 'reject' | 'snooze') {
    setActionLoading(id);
    await fetch('/api/pos/agents/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, decision_id: id }) });
    const dec = decisions.find(d => d.id === id);
    if (action === 'approve') track('roster_published', { week_start: dec?.decision_data?.week_start, total_hours: dec?.decision_data?.total_hours, total_cost_cents: dec?.decision_data?.total_cost_cents });
    track(`agent_decision_${action}`, { agent_type: 'schedule', projected_impact_cents: dec?.projected_impact_cents ?? 0 });
    setActionLoading(null); load();
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📅 Smart Schedule</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {decisions.length > 0 ? `${decisions.length} roster${decisions.length > 1 ? 's' : ''} awaiting approval` : 'No pending rosters'}
          </p>
        </div>
        <button onClick={runNow} disabled={running} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: running ? 'var(--bg-elevated)' : 'var(--violet)', color: running ? 'var(--text-tertiary)' : '#fff', fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {running ? 'Running…' : '⚡ Generate roster'}
        </button>
      </div>

      {loading ? (
        Array.from({ length: 2 }).map((_, i) => <div key={i} style={{ height: 200, background: 'var(--bg-surface)', borderRadius: 14, marginBottom: 12 }} />)
      ) : decisions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>No roster pending</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto 20px' }}>Aria generates a roster every Sunday at 8am AEST for the coming week. Click Generate to create one now.</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 400, margin: '0 auto' }}>Make sure you&apos;ve added your staff in Settings → Staff & Users for Aria to schedule them.</p>
        </div>
      ) : (
        decisions.map(d => {
          const data = d.decision_data;
          return (
            <div key={d.id} style={{ background: 'var(--bg-surface)', borderRadius: 14, marginBottom: 14, overflow: 'hidden', border: '1px solid rgba(96,165,250,0.2)', boxShadow: 'var(--shadow-card)' }}>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{data.outlet_name}</span>
                    <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)' }}>Week of {data.week_start}</span>
                  </div>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(96,165,250,0.14)', color: '#60A5FA', fontWeight: 700 }}>
                    {(d.confidence_score * 100).toFixed(0)}% confidence
                  </span>
                </div>

                {/* Summary metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    ['Shifts', String(data.shift_count)],
                    ['Total hours', `${data.total_hours}h`],
                    ['Labour cost', `A$${(data.total_cost_cents / 100).toFixed(0)}`],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{l}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Week grid placeholder */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 14 }}>
                  {DAYS.map(day => (
                    <div key={day} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, padding: '4px 0', background: 'var(--bg-elevated)', borderRadius: 6 }}>{day}</div>
                  ))}
                </div>

                {/* Aria reasoning */}
                {d.reasoning && (
                  <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.16)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>✨ {d.reasoning}</span>
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', display: 'flex', gap: 8 }}>
                <button onClick={() => doAction(d.id, 'approve')} disabled={actionLoading === d.id} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#34D399', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Publish & Email Staff
                </button>
                <button onClick={() => doAction(d.id, 'snooze')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Snooze 7d</button>
                <button onClick={() => doAction(d.id, 'reject')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#F87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
