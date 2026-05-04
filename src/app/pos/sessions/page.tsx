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
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Cash Sessions</h1>
        <p className="text-xs text-gray-500 mt-0.5">Open and close cash drawer sessions</p>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* Current session card */}
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
          openSession ? 'border-violet-200' : 'border-gray-200'
        }`}>
          <div className={`px-5 py-3 border-b flex items-center gap-2 ${
            openSession ? 'bg-violet-50 border-violet-100' : 'bg-gray-50 border-gray-100'
          }`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${openSession ? 'bg-violet-500' : 'bg-gray-300'}`} />
            <h2 className="text-sm font-semibold text-gray-900">
              {openSession ? 'Register open' : 'Register closed'}
            </h2>
            {openSession && (
              <span className="text-xs text-violet-600 ml-1">
                since {new Date(openSession.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                {' · '}A${(openSession.opening_float || 0).toFixed(2)} float
              </span>
            )}
          </div>

          <div className="p-5">
            {openSession ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl p-3 bg-violet-50 border border-violet-100">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Cash sales</p>
                    <p className="text-lg font-bold font-mono text-gray-900">A${(openSession.total_cash_sales || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl p-3 bg-blue-50 border border-blue-100">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Card sales</p>
                    <p className="text-lg font-bold font-mono text-gray-900">A${(openSession.total_card_sales || 0).toFixed(2)}</p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500 mb-3">Close session — count the cash drawer</p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Closing float (A$)</label>
                      <input value={closingFloat} onChange={e => setClosingFloat(e.target.value)} type="number" min="0" step="0.01"
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:border-transparent"
                        placeholder="0.00" />
                    </div>
                    {variance !== null && (
                      <div className="flex-1">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Variance</p>
                        <p className={`text-sm font-semibold font-mono px-3 py-2.5 rounded-lg ${
                          Math.abs(variance) < 0.05 ? 'text-violet-700 bg-violet-50' :
                          variance > 0 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
                        }`}>
                          {variance >= 0 ? '+' : ''}A${variance.toFixed(2)}
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
                  <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Opening float (A$)</label>
                  <input value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} type="number" min="0" step="0.01"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:border-transparent"
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
        </div>

        {/* Session history */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Session history</h2>
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Opened', 'Closed', 'Float in', 'Float out', 'Cash sales', 'Card sales', 'Variance'].map(h => (
                    <th key={h} className="text-left text-[10px] text-gray-400 uppercase tracking-widest px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-xs text-gray-400">Loading…</td></tr>
                ) : !sessions.filter(s => s.closed_at).length ? (
                  <tr><td colSpan={7} className="text-center py-10 text-xs text-gray-400">No closed sessions yet</td></tr>
                ) : (
                  sessions.filter(s => s.closed_at).map(s => {
                    const cashIn = (s.opening_float || 0) + (s.total_cash_sales || 0);
                    const v = s.closing_float !== null ? s.closing_float - cashIn : null;
                    return (
                      <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-700">
                          {new Date(s.opened_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">
                          {s.closed_at ? new Date(s.closed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-mono">A${(s.opening_float || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                          {s.closing_float !== null ? `A$${s.closing_float.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-900 font-mono font-medium">A${(s.total_cash_sales || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-xs text-gray-900 font-mono font-medium">A${(s.total_card_sales || 0).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {v !== null ? (
                            <span className={`text-xs font-medium font-mono ${
                              Math.abs(v) < 0.05 ? 'text-violet-600' : v >= 0 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {v >= 0 ? '+' : ''}A${v.toFixed(2)}
                            </span>
                          ) : <span className="text-[10px] text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
