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
  id: string; opened_at: string; status: string;
  opening_float: number; total_cash_sales: number; total_card_sales: number;
  closing_float?: number | null;
}

const DENOMS = [
  { label: '$100', value: 100 }, { label: '$50', value: 50 }, { label: '$20', value: 20 },
  { label: '$10', value: 10 },  { label: '$5', value: 5 },   { label: '$2', value: 2 },
  { label: '$1', value: 1 },    { label: '50¢', value: 0.50 }, { label: '20¢', value: 0.20 },
  { label: '10¢', value: 0.10 }, { label: '5¢', value: 0.05 },
];

export default function ClosePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [closing, setClosing] = useState(false);
  const [done, setDone] = useState(false);
  const [debrief, setDebrief] = useState<EODDebrief | null>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/pos/sessions')
      .then(r => r.json())
      .then(d => { setSession(d.openSession ?? null); setLoading(false); });
  }, []);

  const closingFloat = DENOMS.reduce((s, d) => s + (parseFloat(counts[d.value] || '0') || 0) * d.value, 0);
  const expectedCash = (session?.opening_float ?? 0) + (session?.total_cash_sales ?? 0);
  const variance = closingFloat - expectedCash;

  async function closeSession() {
    if (!session) return;
    setClosing(true);
    await fetch('/api/pos/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, closing_float: closingFloat }),
    });
    setClosedSessionId(session.id);
    setDone(true);
    setClosing(false);
    // Fetch EOD debrief non-blocking
    fetchDebrief(session.id);
  }

  async function fetchDebrief(sessionId: string) {
    setDebriefLoading(true);
    try {
      const res = await fetch('/api/aria/pos-end-of-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setDebrief(data);
        // Send EOD email non-blocking (server handles RESEND_API_KEY check)
        fetch('/api/aria/pos-end-of-day/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, debrief: data }),
        }).catch(() => null);
        // Log to aria_outcomes
        if (data?.stats?.today_revenue > 0) {
          fetch('/api/aria/outcomes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recommendation_type: 'eod_summary',
              recommendation_detail: `Session closed. Revenue: A$${data.stats.today_revenue.toFixed(2)}, ${data.stats.today_count} transactions`,
              acted_on: true,
              outcome_value_cents: Math.round(data.stats.today_revenue * 100),
            }),
          }).catch(() => null);
        }
      }
    } catch { /* non-blocking — EOD is a nice-to-have */ }
    setDebriefLoading(false);
  }

  function shareReport() {
    if (!debrief?.stats) return;
    const s = debrief.stats;
    const text = [
      `Aria POS — End of Day Report`,
      `Revenue: A$${s.today_revenue.toFixed(2)}`,
      `Transactions: ${s.today_count}`,
      `Avg basket: A$${s.avg_basket.toFixed(2)}`,
      s.top_product ? `Top product: ${s.top_product}` : '',
      s.vs_avg_pct != null ? `vs 7-day avg: ${s.vs_avg_pct > 0 ? '+' : ''}${s.vs_avg_pct.toFixed(0)}%` : '',
      debrief.debrief ? `\n${debrief.debrief}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text).catch(() => null);
    alert('Report copied to clipboard!');
  }

  if (loading) return <div className="p-6 text-sm text-[rgba(26,26,22,.4)]">Loading…</div>;

  if (done) return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Success header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-8 h-8 text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className="text-lg font-semibold text-[#1a1a16] mb-1">Register Closed</h2>
        <p className="text-sm text-[rgba(26,26,22,.5)]">Closing float: <strong>A${closingFloat.toFixed(2)}</strong> · Variance: <strong className={Math.abs(variance) < 1 ? 'text-emerald-600' : 'text-red-600'}>{variance >= 0 ? '+' : ''}A${variance.toFixed(2)}</strong></p>
      </div>

      {/* EOD Debrief card */}
      {(debriefLoading || debrief) && (
        <div className="bg-[#13131a] rounded-2xl p-6 mb-6 border border-[rgba(29,158,117,0.25)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[#1D9E75] font-bold text-sm">✦ Aria&apos;s End-of-Day Debrief</span>
            {debriefLoading && <span className="text-xs text-[rgba(255,255,255,0.3)] animate-pulse">Analysing…</span>}
          </div>

          {debrief?.stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              {[
                { label: 'Revenue', value: `A$${debrief.stats.today_revenue.toFixed(2)}`, color: '#22c55e' },
                { label: 'Transactions', value: String(debrief.stats.today_count), color: '#60a5fa' },
                { label: 'Avg basket', value: `A$${debrief.stats.avg_basket.toFixed(2)}`, color: '#a78bfa' },
                {
                  label: 'vs 7-day avg',
                  value: debrief.stats.vs_avg_pct != null ? `${debrief.stats.vs_avg_pct > 0 ? '+' : ''}${debrief.stats.vs_avg_pct.toFixed(0)}%` : '—',
                  color: (debrief.stats.vs_avg_pct ?? 0) >= 0 ? '#22c55e' : '#f87171',
                },
              ].map(s => (
                <div key={s.label} className="bg-[rgba(255,255,255,0.05)] rounded-xl p-3 text-center">
                  <p className="text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">{s.label}</p>
                  <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {debrief?.stats?.top_product && (
            <p className="text-xs text-[rgba(255,255,255,0.4)] mb-3">
              Top seller: <span className="text-white font-medium">{debrief.stats.top_product}</span>
            </p>
          )}

          {debrief?.debrief && (
            <div className="bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-xl p-4">
              <p className="text-sm text-[rgba(255,255,255,0.75)] leading-relaxed">{debrief.debrief}</p>
            </div>
          )}

          {!debriefLoading && !debrief?.debrief && (
            <p className="text-xs text-[rgba(255,255,255,0.3)]">Debrief not available — add your Anthropic API key to enable AI analysis.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-center">
        {debrief?.stats && (
          <button onClick={shareReport}
            className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[rgba(0,0,0,0.1)] text-[rgba(26,26,22,0.7)] hover:bg-[rgba(0,0,0,0.04)] transition-colors">
            Copy report
          </button>
        )}
        <button onClick={() => window.print()}
          className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[rgba(0,0,0,0.1)] text-[rgba(26,26,22,0.7)] hover:bg-[rgba(0,0,0,0.04)] transition-colors">
          Print Z-report
        </button>
        <button onClick={() => router.push('/pos/terminal')}
          className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
          Back to Register
        </button>
      </div>
    </div>
  );

  if (!session) return (
    <div className="p-6 max-w-md mx-auto text-center pt-20">
      <p className="text-sm text-[rgba(26,26,22,.45)]">No open session — open the register first.</p>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1a1a16]">Close Register</h1>
        <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Count your cash float before closing</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Cash Sales', value: session.total_cash_sales ?? 0, color: '#16a34a' },
          { label: 'Card Sales', value: session.total_card_sales ?? 0, color: '#2563eb' },
          { label: 'Expected Cash', value: expectedCash, color: '#1a1a16' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm">
            <p className="text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider mb-1">{label}</p>
            <p className="text-xl font-bold" style={{ color }}>${value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Denom counter */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
          <p className="text-xs font-medium text-[rgba(26,26,22,.5)]">Count Cash Float</p>
        </div>
        <div className="p-4 grid grid-cols-2 gap-2">
          {DENOMS.map(d => {
            const qty = parseFloat(counts[d.value] || '0') || 0;
            return (
              <div key={d.value} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[rgba(0,0,0,.02)]">
                <span className="text-xs font-semibold text-[#1a1a16] w-10">{d.label}</span>
                <input value={counts[d.value] ?? ''} onChange={e => setCounts(c => ({ ...c, [d.value]: e.target.value }))}
                  type="number" min="0" placeholder="0"
                  className="w-16 bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-2 py-1.5 text-xs text-[#1a1a16] text-center focus:outline-none focus:border-[#2563eb]" />
                <span className="text-xs text-[rgba(26,26,22,.45)] ml-auto">${(qty * d.value).toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Float total + variance */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-[rgba(26,26,22,.5)]">Closing Float</p>
          <p className="text-2xl font-bold text-[#1a1a16]">${closingFloat.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[rgba(26,26,22,.5)]">Variance</p>
          <p className={`text-xl font-bold ${variance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {variance >= 0 ? '+' : ''}{variance.toFixed(2)}
          </p>
        </div>
      </div>

      <button onClick={closeSession} disabled={closing}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
        style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
        {closing ? 'Closing…' : 'Close Register & End Session'}
      </button>
    </div>
  );
}