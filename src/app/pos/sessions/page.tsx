'use client';
import { useState, useEffect } from 'react';

interface Session {
  id: string; opened_at: string; closed_at: string | null;
  opening_float: number; closing_float: number | null;
  total_cash_sales: number | null; total_card_sales: number | null;
  opened_by: string;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const [closingFloat, setClosingFloat] = useState('');
  const [closing, setClosing] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('200');
  const [opening, setOpening] = useState(false);

  const load = () => {
    fetch('/api/pos/sessions?history=true')
      .then(r => r.json())
      .then(d => {
        setSessions(d.sessions || []);
        setOpenSession(d.openSession || null);
        setLoading(false);
      });
  };
  useEffect(load, []);

  const handleOpen = async () => {
    setOpening(true);
    await fetch('/api/pos/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_float: parseFloat(openingFloat) }),
    });
    setOpening(false);
    load();
  };

  const handleClose = async () => {
    if (!openSession) return;
    setClosing(true);
    await fetch('/api/pos/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: openSession.id,
        closing_float: parseFloat(closingFloat) || 0,
      }),
    });
    setClosing(false);
    setClosingFloat('');
    load();
  };

  const variance = openSession && closingFloat
    ? (parseFloat(closingFloat) || 0) - (openSession.opening_float || 0) - (openSession.total_cash_sales || 0)
    : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Cash sessions</h1>
        <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">Open and close cash drawer sessions</p>
      </div>

      {/* Current session card */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#111118', border: `1px solid ${openSession ? 'rgba(52,211,153,.25)' : 'rgba(255,255,255,.07)'}` }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-white">Current session</h2>
            {openSession ? (
              <p className="text-xs text-emerald-400 mt-0.5">
                Open since {new Date(openSession.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                {' · '}${(openSession.opening_float || 0).toFixed(2)} float
              </p>
            ) : (
              <p className="text-xs text-[rgba(255,255,255,.3)] mt-0.5">No session open</p>
            )}
          </div>
          <div className={`w-2 h-2 rounded-full mt-1 ${openSession ? 'bg-emerald-400' : 'bg-white/20'}`} />
        </div>

        {openSession ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-3" style={{ background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.15)' }}>
                <p className="text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-1">Cash sales</p>
                <p className="text-lg font-semibold text-white">${(openSession.total_cash_sales || 0).toFixed(2)}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.15)' }}>
                <p className="text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-1">Card sales</p>
                <p className="text-lg font-semibold text-white">${(openSession.total_card_sales || 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <p className="text-xs text-[rgba(255,255,255,.5)] mb-3">Close session — count the cash drawer</p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-1.5">Closing float ($)</label>
                  <input value={closingFloat} onChange={e => setClosingFloat(e.target.value)} type="number" min="0" step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#F97316]"
                    placeholder="0.00" />
                </div>
                {variance !== null && (
                  <div className="flex-1">
                    <p className="text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-1.5">Variance</p>
                    <p className={`text-sm font-medium px-3 py-2.5 ${variance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {variance >= 0 ? '+' : ''}${variance.toFixed(2)}
                    </p>
                  </div>
                )}
                <button onClick={handleClose} disabled={closing || !closingFloat}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
                  {closing ? 'Closing…' : 'Close session'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-1.5">Opening float ($)</label>
              <input value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} type="number" min="0" step="0.01"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#F97316]"
                placeholder="200.00" />
            </div>
            <button onClick={handleOpen} disabled={opening}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
              {opening ? 'Opening…' : 'Open session'}
            </button>
          </div>
        )}
      </div>

      {/* Session history */}
      <h2 className="text-sm font-medium text-white mb-3">Session history</h2>
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.07)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: '#111118', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              {['Opened', 'Closed', 'Float in', 'Float out', 'Cash sales', 'Card sales', 'Variance'].map(h => (
                <th key={h} className="text-left text-[10px] text-[rgba(255,255,255,.35)] uppercase tracking-widest px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-xs text-[rgba(255,255,255,.25)]">Loading…</td></tr>
            ) : !sessions.filter(s => s.closed_at).length ? (
              <tr><td colSpan={7} className="text-center py-10 text-xs text-[rgba(255,255,255,.25)]">No closed sessions yet</td></tr>
            ) : (
              sessions.filter(s => s.closed_at).map(s => {
                const cashIn = (s.opening_float || 0) + (s.total_cash_sales || 0);
                const v = s.closing_float !== null ? s.closing_float - cashIn : null;
                return (
                  <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                    <td className="px-4 py-3 text-xs text-[rgba(255,255,255,.65)]">
                      {new Date(s.opened_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-xs text-[rgba(255,255,255,.65)]">
                      {s.closed_at ? new Date(s.closed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[rgba(255,255,255,.5)]">${(s.opening_float || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-[rgba(255,255,255,.5)]">
                      {s.closing_float !== null ? `$${s.closing_float.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[rgba(255,255,255,.7)]">${(s.total_cash_sales || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-[rgba(255,255,255,.7)]">${(s.total_card_sales || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {v !== null ? (
                        <span className={`text-xs font-medium ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {v >= 0 ? '+' : ''}${v.toFixed(2)}
                        </span>
                      ) : <span className="text-[10px] text-[rgba(255,255,255,.25)]">—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}