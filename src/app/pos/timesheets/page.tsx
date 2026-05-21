'use client';
import { useState, useEffect, useCallback } from 'react';

interface EmployeeSession {
  id: string;
  staff_name: string | null;
  staff_id: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  total_minutes: number | null;
  pay_rate_cents?: number;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function estimatedPay(totalMinutes: number | null, payRateCents: number): string {
  if (!totalMinutes || !payRateCents) return '—';
  return `A$${((totalMinutes / 60) * (payRateCents / 100)).toFixed(2)}`;
}

export default function TimesheetsPage() {
  const [sessions, setSessions] = useState<EmployeeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [staffName, setStaffName] = useState('');
  const [clockingIn, setClockedIn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pos/timesheets?from=${from}&to=${to}`);
      if (res.ok) { const d = await res.json(); setSessions(d.sessions ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function clockIn() {
    if (!staffName.trim()) return;
    setClockedIn(true);
    await fetch('/api/pos/timesheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_name: staffName }),
    });
    setStaffName('');
    setClockedIn(false);
    load();
  }

  async function clockOut(sessionId: string) {
    await fetch('/api/pos/timesheets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    load();
  }

  function exportCSV() {
    const rows = [['Staff', 'Date', 'Clock In', 'Clock Out', 'Break', 'Total Hours', 'Est. Pay']];
    sessions.forEach(s => {
      rows.push([
        s.staff_name ?? '',
        s.clock_in ? new Date(s.clock_in).toLocaleDateString('en-AU') : '',
        s.clock_in ? new Date(s.clock_in).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '',
        s.clock_out ? new Date(s.clock_out).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : 'Active',
        String(s.break_minutes ?? 0) + ' min',
        formatDuration(s.total_minutes),
        estimatedPay(s.total_minutes, s.pay_rate_cents ?? 0),
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `timesheets-${from}-to-${to}.csv`;
    a.click();
  }

  const totalHours = sessions.reduce((s, e) => s + ((e.total_minutes ?? 0) / 60), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Timesheets</h1>
          <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">Staff clock-in/out and hours</p>
        </div>
        <button onClick={exportCSV}
          className="px-3 py-2 rounded-xl text-xs font-medium border border-[rgba(0,0,0,0.1)] text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.04)] transition-colors">
          Export CSV
        </button>
      </div>

      {/* Quick clock in */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-4 mb-5 shadow-sm">
        <p className="text-xs font-semibold text-[rgba(26,26,22,0.6)] mb-3 uppercase tracking-wide">Clock in staff member</p>
        <div className="flex gap-2">
          <input value={staffName} onChange={e => setStaffName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && clockIn()}
            placeholder="Staff name or ID"
            className="flex-1 bg-[rgba(0,0,0,0.04)] border border-[rgba(0,0,0,0.1)] rounded-xl px-3 py-2 text-sm text-[#1a1a16] outline-none focus:border-[#8B5CF6]" />
          <button onClick={clockIn} disabled={clockingIn || !staffName.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ background: '#006AFF' }}>
            {clockingIn ? '…' : 'Clock in'}
          </button>
        </div>
      </div>

      {/* Active sessions */}
      {sessions.filter(s => !s.clock_out).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-[rgba(26,26,22,0.6)] mb-2 uppercase tracking-wide">Currently clocked in</p>
          <div className="space-y-2">
            {sessions.filter(s => !s.clock_out).map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-[rgba(22,163,74,0.3)] p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#1a1a16]">{s.staff_name ?? 'Unknown'}</p>
                  <p className="text-xs text-[rgba(26,26,22,0.5)]">
                    Since {new Date(s.clock_in).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{formatDuration(Math.floor((Date.now() - new Date(s.clock_in).getTime()) / 60000))} so far
                  </p>
                </div>
                <button onClick={() => clockOut(s.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                  Clock out
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date filter + summary */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-3 py-2 text-xs text-[#1a1a16] outline-none" />
          <span className="text-xs text-[rgba(26,26,22,0.4)]">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-white border border-[rgba(0,0,0,0.1)] rounded-xl px-3 py-2 text-xs text-[#1a1a16] outline-none" />
        </div>
        <p className="text-xs text-[rgba(26,26,22,0.5)]">
          {sessions.filter(s => s.clock_out).length} shifts · {totalHours.toFixed(1)} total hours
        </p>
      </div>

      {/* Sessions table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-[rgba(0,0,0,0.05)] rounded-xl animate-pulse" />)}
        </div>
      ) : sessions.filter(s => s.clock_out).length === 0 ? (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-8 text-center">
          <p className="text-sm text-[rgba(26,26,22,0.4)]">No completed shifts in this period.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(0,0,0,0.06)]">
                {['Staff', 'Date', 'Clock In', 'Clock Out', 'Break', 'Hours', 'Est. Pay'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[rgba(26,26,22,0.45)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.filter(s => s.clock_out).map(s => (
                <tr key={s.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[rgba(0,0,0,0.02)]">
                  <td className="px-4 py-3 font-medium text-[#1a1a16]">{s.staff_name ?? '—'}</td>
                  <td className="px-4 py-3 text-[rgba(26,26,22,0.6)]">
                    {new Date(s.clock_in).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-[rgba(26,26,22,0.6)]">
                    {new Date(s.clock_in).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-[rgba(26,26,22,0.6)]">
                    {s.clock_out ? new Date(s.clock_out).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[rgba(26,26,22,0.6)]">{s.break_minutes ?? 0} min</td>
                  <td className="px-4 py-3 font-semibold text-[#1a1a16]">{formatDuration(s.total_minutes)}</td>
                  <td className="px-4 py-3 text-[rgba(26,26,22,0.6)]">{estimatedPay(s.total_minutes, s.pay_rate_cents ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
