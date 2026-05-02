'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface EODDebrief {
  debrief: string | null;
  stats: {
    today_revenue: number;
    today_count: number;
    avg_basket: number;
    top_product: string | null;
    vs_avg_pct: number | null;
  } | null;
}

interface Session {
  id: string; opened_at: string; status: string; opened_by: string | null;
  opening_float: number; total_cash_sales: number; total_card_sales: number;
  transaction_count?: number; closing_float?: number | null;
}

const DENOMS = [
  { label: '$100', value: 100 }, { label: '$50', value: 50 }, { label: '$20', value: 20 },
  { label: '$10', value: 10 },  { label: '$5', value: 5 },   { label: '$2', value: 2 },
  { label: '$1', value: 1 },    { label: '50¢', value: 0.50 }, { label: '20¢', value: 0.20 },
  { label: '10¢', value: 0.10 }, { label: '5¢', value: 0.05 },
];

function formatDuration(openedAt: string) {
  const ms = Date.now() - new Date(openedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ClosePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [closing, setClosing] = useState(false);
  const [done, setDone] = useState(false);
  const [debrief, setDebrief] = useState<EODDebrief | null>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);

  useEffect(() => {
    fetch('/api/pos/sessions')
      .then(r => r.json())
      .then(d => { setSession(d.openSession ?? null); setLoading(false); });
  }, []);

  const closingFloat = DENOMS.reduce((s, d) => s + (parseFloat(counts[d.value] || '0') || 0) * d.value, 0);
  const expectedCash = (session?.opening_float ?? 0) + (session?.total_cash_sales ?? 0);
  const variance = closingFloat - expectedCash;

  async function closeSession() {
    if (!session || !confirm('Close the register? This action cannot be undone.')) return;
    setClosing(true);
    await fetch('/api/pos/sessions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, closing_float: closingFloat }),
    });
    setDone(true);
    setClosing(false);
    fetchDebrief(session.id);
  }

  async function fetchDebrief(sessionId: string) {
    setDebriefLoading(true);
    try {
      const res = await fetch('/api/aria/pos-end-of-day', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setDebrief(data);
        fetch('/api/aria/pos-end-of-day/email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, debrief: data }),
        }).catch(() => null);
        if (data?.stats?.today_revenue > 0) {
          fetch('/api/aria/outcomes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recommendation_type: 'eod_summary',
              recommendation_detail: `Session closed. Revenue: A$${data.stats.today_revenue.toFixed(2)}, ${data.stats.today_count} transactions`,
              acted_on: true, outcome_value_cents: Math.round(data.stats.today_revenue * 100),
            }),
          }).catch(() => null);
        }
      }
    } catch { /* non-blocking */ }
    setDebriefLoading(false);
  }

  function shareReport() {
    if (!debrief?.stats) return;
    const s = debrief.stats;
    const text = [`Aria POS — End of Day Report`, `Revenue: A$${s.today_revenue.toFixed(2)}`,
      `Transactions: ${s.today_count}`, `Avg basket: A$${s.avg_basket.toFixed(2)}`,
      s.top_product ? `Top product: ${s.top_product}` : '',
      s.vs_avg_pct != null ? `vs 7-day avg: ${s.vs_avg_pct > 0 ? '+' : ''}${s.vs_avg_pct.toFixed(0)}%` : '',
      debrief.debrief ? `\n${debrief.debrief}` : ''].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text).catch(() => null);
    alert('Report copied to clipboard!');
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      </div>
    );
  }

  /* ── SUCCESS STATE ──────────────────────────────────────────── */
  if (done) return (
    <div className="min-h-full bg-gray-50 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Register Closed</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Closing float: <span className="font-mono font-medium">A${closingFloat.toFixed(2)}</span>
          {' · '}Variance:{' '}
          <span className={`font-mono font-medium ${Math.abs(variance) < 0.05 ? 'text-emerald-600' : 'text-red-600'}`}>
            {variance >= 0 ? '+' : ''}A${variance.toFixed(2)}
          </span>
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Success card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth={2.5} className="w-6 h-6"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Session ended successfully</p>
            <p className="text-sm text-gray-500 mt-0.5">Z-Report generated · Data saved</p>
          </div>
        </div>

        {/* EOD debrief */}
        {(debriefLoading || debrief) && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden border-l-4 border-l-[#059669]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Aria's end of day</h2>
              {debriefLoading && <span className="text-xs text-gray-400 animate-pulse">Analysing…</span>}
            </div>
            {debrief?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-gray-100">
                {[
                  { label: 'Revenue', value: `A$${debrief.stats.today_revenue.toFixed(2)}`, color: 'text-gray-900' },
                  { label: 'Transactions', value: String(debrief.stats.today_count), color: 'text-gray-900' },
                  { label: 'Avg basket', value: `A$${debrief.stats.avg_basket.toFixed(2)}`, color: 'text-gray-900' },
                  {
                    label: 'vs 7-day avg',
                    value: debrief.stats.vs_avg_pct != null ? `${debrief.stats.vs_avg_pct > 0 ? '+' : ''}${debrief.stats.vs_avg_pct.toFixed(0)}%` : '—',
                    color: (debrief.stats.vs_avg_pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600',
                  },
                ].map((s, i) => (
                  <div key={s.label} className={`px-5 py-4 ${i < 3 ? 'border-r border-gray-100' : ''}`}>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                    <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}
            {debrief?.stats?.top_product && (
              <div className="px-6 py-2 border-b border-gray-100">
                <p className="text-sm text-gray-500">Top seller: <span className="font-medium text-gray-900">{debrief.stats.top_product}</span></p>
              </div>
            )}
            {debrief?.debrief && (
              <div className="px-6 py-4">
                <p className="text-sm text-gray-700 leading-relaxed">{debrief.debrief}</p>
              </div>
            )}
            {!debriefLoading && !debrief?.debrief && (
              <div className="px-6 py-4">
                <p className="text-sm text-gray-400">AI debrief not available — add your Anthropic API key to enable.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {debrief?.stats && (
            <button onClick={shareReport}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors">
              Copy report
            </button>
          )}
          <button onClick={() => window.print()}
            className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors">
            🖨️ Print Z-Report
          </button>
          <button onClick={() => router.push('/pos')}
            className="px-5 py-2.5 rounded-xl text-sm font-medium bg-[#111827] text-white hover:bg-gray-800 transition-colors">
            Back to Register
          </button>
        </div>
      </div>
    </div>
  );

  if (!session) return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-sm text-gray-500">No open session — open the register first.</p>
        <button onClick={() => router.push('/pos')}
          className="mt-4 px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800">
          Go to Register
        </button>
      </div>
    </div>
  );

  const totalRevenue = (session.total_cash_sales ?? 0) + (session.total_card_sales ?? 0);

  /* ── CLOSE REGISTER FORM ────────────────────────────────────── */
  return (
    <div className="min-h-full bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Close Register</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Opened {new Date(session.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
          {session.opened_by && <> · {session.opened_by}</>}
          {' · '}{formatDuration(session.opened_at)} session
        </p>
      </div>

      <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">

        {/* Cash reconciliation card */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Cash reconciliation</h2>
          </div>
          <div className="px-6 py-4">
            <div className="space-y-0 mb-4">
              {[
                { label: 'Opening float', value: session.opening_float ?? 0, color: 'text-gray-900' },
                { label: 'Cash sales', value: session.total_cash_sales ?? 0, color: 'text-emerald-600' },
                { label: 'Expected in drawer', value: expectedCash, color: 'text-gray-900', bold: true },
              ].map(row => (
                <div key={row.label} className={`flex justify-between py-2 border-b border-gray-50 ${row.bold ? 'font-semibold' : ''}`}>
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span className={`text-sm font-mono ${row.color}`}>A${row.value.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Denomination counter */}
            <p className="text-sm font-medium text-gray-700 mb-3">Count the cash in the drawer</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {DENOMS.map(d => {
                const qty = parseFloat(counts[d.value] || '0') || 0;
                return (
                  <div key={d.value} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <span className="text-sm font-semibold text-gray-900 w-12">{d.label}</span>
                    <input value={counts[d.value] ?? ''} onChange={e => setCounts(c => ({ ...c, [d.value]: e.target.value }))}
                      type="number" min="0" placeholder="0"
                      className="w-16 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 text-center outline-none focus:ring-1 focus:ring-gray-400" />
                    <span className="text-sm text-gray-400 font-mono ml-auto">A${(qty * d.value).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            {/* Variance display */}
            <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${
              Math.abs(variance) < 0.05 ? 'bg-emerald-50 border border-emerald-100' :
              variance > 0 ? 'bg-amber-50 border border-amber-100' : 'bg-red-50 border border-red-100'
            }`}>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Counted</p>
                <p className="text-2xl font-bold font-mono text-gray-900">A${closingFloat.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-0.5">Variance</p>
                <p className={`text-xl font-bold font-mono ${
                  Math.abs(variance) < 0.05 ? 'text-emerald-600' :
                  variance > 0 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {Math.abs(variance) < 0.05 ? '✓ Balanced' : `${variance >= 0 ? '+' : ''}A${variance.toFixed(2)}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Session summary card */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Session summary</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total revenue', value: `A$${totalRevenue.toFixed(2)}`, big: true },
                { label: 'Transactions', value: String(session.transaction_count ?? 0), big: true },
                { label: 'Cash sales', value: `A$${(session.total_cash_sales ?? 0).toFixed(2)}`, big: false },
                { label: 'Card sales', value: `A$${(session.total_card_sales ?? 0).toFixed(2)}`, big: false },
                { label: 'Avg basket', value: (session.transaction_count ?? 0) > 0 ? `A$${(totalRevenue / (session.transaction_count ?? 1)).toFixed(2)}` : '—', big: false },
                { label: 'Opening float', value: `A$${(session.opening_float ?? 0).toFixed(2)}`, big: false },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`font-bold font-mono text-gray-900 ${s.big ? 'text-2xl' : 'text-lg'}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Close button */}
        <button onClick={closeSession} disabled={closing}
          className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {closing ? <><Spinner /> Closing…</> : 'Close Register & End Session'}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}
