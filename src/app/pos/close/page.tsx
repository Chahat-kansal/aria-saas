'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Session {
  id: string; opened_at: string; status: string;
  opening_float: number; cash_sales: number; card_sales: number;
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

  useEffect(() => {
    fetch('/api/pos/sessions')
      .then(r => r.json())
      .then(d => { setSession(d.openSession ?? null); setLoading(false); });
  }, []);

  const closingFloat = DENOMS.reduce((s, d) => s + (parseFloat(counts[d.value] || '0') || 0) * d.value, 0);
  const expectedCash = (session?.opening_float ?? 0) + (session?.cash_sales ?? 0);
  const variance = closingFloat - expectedCash;

  async function closeSession() {
    if (!session) return;
    setClosing(true);
    await fetch('/api/pos/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, closing_float: closingFloat }),
    });
    setDone(true);
    setClosing(false);
  }

  if (loading) return <div className="p-6 text-sm text-[rgba(26,26,22,.4)]">Loading…</div>;

  if (done) return (
    <div className="p-6 max-w-md mx-auto text-center pt-20">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-8 h-8 text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2 className="text-lg font-semibold text-[#1a1a16] mb-2">Register Closed</h2>
      <p className="text-sm text-[rgba(26,26,22,.5)] mb-6">End of day closure complete. Closing float: <strong>${closingFloat.toFixed(2)}</strong></p>
      <button onClick={() => router.push('/pos/terminal')}
        className="px-6 py-2.5 rounded-lg text-sm font-medium text-white"
        style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
        Back to Register
      </button>
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
          { label: 'Cash Sales', value: session.cash_sales ?? 0, color: '#16a34a' },
          { label: 'Card Sales', value: session.card_sales ?? 0, color: '#2563eb' },
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