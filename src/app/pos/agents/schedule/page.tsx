'use client';
import { useState, useEffect, useCallback } from 'react';
import { track } from '@/lib/analytics';

interface Shift { staff_id: string; staff_name: string; hour: number; day: string; hourly_rate_cents: number; }
interface RosterRow { outlet_id: string; week_start: string; shifts: Shift[]; total_hours: number; total_cost_cents: number; published: boolean; }
interface ScheduleData { outlet_id: string; outlet_name: string; week_start: string; shift_count: number; total_hours: number; total_cost_cents: number; }
interface Decision { id: string; reasoning: string; projected_impact_cents: number; confidence_score: number; created_at: string; status: string; decision_data: ScheduleData; }

const HOURS = Array.from({ length: 13 }, (_, i) => i + 9);
const STAFF_COLORS = ['#006AFF', '#EC4899', '#3B82F6', '#14B8A6', '#F59E0B', '#EF4444', '#10B981', '#6366F1'];

function staffColor(staffId: string): string {
  const hash = staffId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return STAFF_COLORS[hash % STAFF_COLORS.length];
}

const PALETTE = STAFF_COLORS;
const fmtHour = (h: number) => h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;

function buildGrid(roster: RosterRow) {
  const dates = [...new Set(roster.shifts.map(s => s.day))].sort();
  // Deterministic color by staff_id so it never changes between renders
  const nameColorMap = new Map<string, string>();
  const staffIdMap = new Map<string, string>(); // name → id for color lookup
  for (const s of roster.shifts) {
    if (!staffIdMap.has(s.staff_name)) staffIdMap.set(s.staff_name, s.staff_id);
    if (!nameColorMap.has(s.staff_name)) nameColorMap.set(s.staff_name, staffColor(s.staff_id));
  }
  const grid = new Map<string, Map<number, string[]>>();
  for (const s of roster.shifts) {
    if (!grid.has(s.day)) grid.set(s.day, new Map());
    const hm = grid.get(s.day)!;
    if (!hm.has(s.hour)) hm.set(s.hour, []);
    if (!hm.get(s.hour)!.includes(s.staff_name)) hm.get(s.hour)!.push(s.staff_name);
  }
  return { dates, nameColorMap, grid };
}

export default function ScheduleAgentPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [rosters, setRosters] = useState<RosterRow[]>([]);
  const [selected, setSelected] = useState<RosterRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/pos/agents/schedule?status=pending').then(r => r.json()).then(d => {
      const decs: Decision[] = d.decisions ?? [];
      const rs: RosterRow[] = (d.roster ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        shifts: Array.isArray(r.shifts) ? (r.shifts as Shift[]) : [],
      }));
      setDecisions(decs);
      setRosters(rs);
      setSelected(prev => prev ? (rs.find(r => r.outlet_id === prev.outlet_id) ?? rs[0] ?? null) : (rs[0] ?? null));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { document.title = 'Smart Schedule | Aria POS'; }, [])
  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch('/api/pos/agents/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_now' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Run failed');
      const n = (data.decisions ?? []).length;
      setToast({ message: n > 0 ? `Aria generated ${n} roster${n !== 1 ? 's' : ''}` : 'No rosters generated — add staff first', ok: n > 0 });
    } catch {
      setToast({ message: 'Run failed — check logs', ok: false });
    } finally {
      setRunning(false);
      load();
      setTimeout(() => setToast(null), 3500);
    }
  }

  async function publish(decId: string) {
    setPublishing(true);
    await fetch('/api/pos/agents/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', decision_id: decId }),
    });
    const dec = decisions.find(d => d.id === decId);
    track('roster_published', { week_start: dec?.decision_data?.week_start, total_hours: dec?.decision_data?.total_hours, total_cost_cents: dec?.decision_data?.total_cost_cents });
    track('agent_decision_approved', { agent_type: 'schedule', projected_impact_cents: dec?.projected_impact_cents ?? 0 });
    setPublishing(false);
    setConfirmPublish(false);
    load();
  }

  const outletNames = new Map(decisions.map(d => [d.decision_data.outlet_id, d.decision_data.outlet_name]));
  const pendingDec = decisions.find(d => selected && d.decision_data.outlet_id === selected.outlet_id) ?? decisions[0] ?? null;
  const gridData = selected && selected.shifts.length > 0 ? buildGrid(selected) : null;
  const staffNames = gridData ? [...gridData.nameColorMap.keys()] : [];

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📅 Smart Schedule</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {selected
              ? `${outletNames.get(selected.outlet_id) ?? 'Outlet'} · Week of ${selected.week_start}${selected.published ? ' · Published' : ''}`
              : 'No roster yet'}
          </p>
        </div>
        <button onClick={runNow} disabled={running} style={{
          padding: '8px 18px', borderRadius: 9, border: 'none',
          background: running ? 'var(--bg-elevated)' : 'var(--violet)',
          color: running ? 'var(--text-tertiary)' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {running
            ? <><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--violet)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />Generating…</>
            : '⚡ Generate from Aria'}
        </button>
      </div>

      {rosters.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {rosters.map(r => (
            <button key={r.outlet_id} onClick={() => setSelected(r)} style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-default)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              background: selected?.outlet_id === r.outlet_id ? 'var(--violet)' : 'var(--bg-surface)',
              color: selected?.outlet_id === r.outlet_id ? '#fff' : 'var(--text-secondary)',
            }}>
              {outletNames.get(r.outlet_id) ?? r.outlet_id}
            </button>
          ))}
        </div>
      )}

      {pendingDec && !selected?.published && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 12, padding: '12px 18px', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#00B140' }}>✨ Aria generated this roster</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 10 }}>
              {pendingDec.decision_data.total_hours ?? 0}h · A${((pendingDec.decision_data.total_cost_cents ?? 0) / 100).toFixed(0)} labour · {((pendingDec.confidence_score ?? 0) * 100).toFixed(0)}% confidence
            </span>
            {pendingDec.reasoning && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 4 }}>
                {pendingDec.reasoning}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmPublish(true)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#00B140', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              ✓ Publish & Email Staff
            </button>
            <button onClick={async () => {
              await fetch('/api/pos/agents/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', decision_id: pendingDec.id }) });
              load();
            }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#F87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Reject
            </button>
          </div>
        </div>
      )}

      {loading ? (
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 36, background: 'var(--bg-surface)', borderRadius: 6, marginBottom: 3 }} />
        ))
      ) : gridData ? (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
            <div style={{ minWidth: 560 }}>
              <div style={{ display: 'grid', gridTemplateColumns: `72px repeat(${gridData.dates.length}, 1fr)`, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ padding: '8px 10px', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700 }}>TIME</div>
                {gridData.dates.map(d => {
                  const dt = new Date(d + 'T00:00:00');
                  return (
                    <div key={d} style={{ padding: '8px 4px', textAlign: 'center', borderLeft: '1px solid var(--divider)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {dt.toLocaleDateString('en-AU', { weekday: 'short' })}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{dt.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              {HOURS.map(hour => (
                <div key={hour} style={{ display: 'grid', gridTemplateColumns: `72px repeat(${gridData.dates.length}, 1fr)`, borderBottom: '1px solid var(--divider)' }}>
                  <div style={{ padding: '4px 10px', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, background: 'var(--bg-elevated)', borderRight: '1px solid var(--divider)', display: 'flex', alignItems: 'center' }}>
                    {fmtHour(hour)}
                  </div>
                  {gridData.dates.map(d => {
                    const staff = gridData.grid.get(d)?.get(hour) ?? [];
                    return (
                      <div key={d} style={{ padding: '3px 4px', minHeight: 32, borderLeft: '1px solid var(--divider)', background: staff.length === 0 ? 'rgba(248,113,113,0.04)' : 'transparent' }}>
                        {staff.map(name => {
                          const color = gridData.nameColorMap.get(name) ?? '#006AFF';
                          return (
                            <span key={name} style={{ display: 'block', background: color + '22', color, borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {name.split(' ')[0]}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {staffNames.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {staffNames.map(name => {
                const color = gridData.nameColorMap.get(name) ?? '#006AFF';
                return (
                  <span key={name} style={{ background: color + '22', color, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>
                    {name}
                  </span>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>No roster yet</h3>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 14, maxWidth: 400, margin: '0 auto 12px' }}>
            Click Generate to let Aria create an optimised roster based on your sales patterns.
          </p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, maxWidth: 400, margin: '0 auto' }}>
            Make sure you&apos;ve added your staff in Settings → Staff & Users.
          </p>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, background: toast.ok ? '#00B140' : '#F87171', color: '#000', padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', maxWidth: 300 }}>
          {toast.message}
        </div>
      )}

      {confirmPublish && pendingDec && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 28, maxWidth: 400, width: '90%', boxShadow: 'var(--shadow-lg)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              Publish roster for {pendingDec.decision_data.outlet_name ?? 'outlet'}?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Week of {pendingDec.decision_data.week_start} · {pendingDec.decision_data.total_hours ?? 0}h · A${((pendingDec.decision_data.total_cost_cents ?? 0) / 100).toFixed(0)} labour
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>
              All active staff with email addresses will receive a roster notification.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmPublish(false)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={() => publish(pendingDec.id)} disabled={publishing} style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: '#00B140', color: '#000', fontSize: 13, fontWeight: 700, cursor: publishing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {publishing ? 'Sending…' : '✓ Publish & Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
