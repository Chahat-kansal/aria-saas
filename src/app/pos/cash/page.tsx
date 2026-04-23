'use client';
import { useState, useEffect } from 'react';

interface CashEntry { id: string; type: 'float_in' | 'float_out' | 'sale' | 'refund'; amount: number; note: string | null; created_at: string; }
interface Session { id: string; opened_at: string; status: string; opening_float: number; cash_sales: number; card_sales: number; }

export default function CashPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'in' | 'out' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/pos/sessions').then(r => r.json()),
      fetch('/api/pos/cash').then(r => r.json()),
    ]).then(([s, c]) => {
      setSession(s.openSession ?? null);
      setEntries(c.entries ?? []);
      setLoading(false);
    });
  }, []);

  async function submit() {
    if (!amount || isNaN(parseFloat(amount))) return;
    setSaving(true);
    const res = await fetch('/api/pos/cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: modal === 'in' ? 'float_in' : 'float_out', amount: parseFloat(amount), note: note || null }),
    });
    const d = await res.json();
    if (d.entry) setEntries(es => [d.entry, ...es]);
    setModal(null); setAmount(''); setNote(''); setSaving(false);
  }

  const cashIn = entries.filter(e => e.type === 'float_in').reduce((s, e) => s + e.amount, 0);
  const cashOut = entries.filter(e => e.type === 'float_out').reduce((s, e) => s + e.amount, 0);
  const cashBalance = (session?.opening_float ?? 0) + (session?.cash_sales ?? 0) + cashIn - cashOut;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Manage Cash</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Float movements and cash balance</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('out')}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.7)] hover:bg-[rgba(0,0,0,.04)] transition-colors">
            Cash Out
          </button>
          <button onClick={() => setModal('in')}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
            Cash In
          </button>
        </div>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Opening Float', value: session?.opening_float ?? 0, color: '#2563eb' },
          { label: 'Cash Sales', value: session?.cash_sales ?? 0, color: '#16a34a' },
          { label: 'Current Balance', value: cashBalance, color: '#1a1a16' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm">
            <p className="text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold" style={{ color }}>${value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Movements */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
          <p className="text-xs font-medium text-[rgba(26,26,22,.5)]">Cash Movements</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-[rgba(26,26,22,.3)]">Loading…</div>
        ) : !entries.length ? (
          <div className="p-12 text-center text-xs text-[rgba(26,26,22,.3)]">No movements recorded yet</div>
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,.05)]">
            {entries.map(e => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${e.type === 'float_in' ? 'bg-emerald-500' : 'bg-red-400'}`}>
                    {e.type === 'float_in' ? '+' : '−'}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#1a1a16]">
                      {e.type === 'float_in' ? 'Cash In' : e.type === 'float_out' ? 'Cash Out' : e.type === 'sale' ? 'Sale' : 'Refund'}
                    </p>
                    {e.note && <p className="text-[10px] text-[rgba(26,26,22,.4)]">{e.note}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${e.type === 'float_in' || e.type === 'sale' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {e.type === 'float_in' || e.type === 'sale' ? '+' : '−'}${e.amount.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-[rgba(26,26,22,.3)]">{new Date(e.created_at).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,.08)]">
              <h2 className="text-base font-semibold text-[#1a1a16]">{modal === 'in' ? 'Cash In' : 'Cash Out'}</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[rgba(26,26,22,.4)]">$</span>
                  <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="0" placeholder="0.00" autoFocus
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg pl-6 pr-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Note</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional reason…"
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(0,0,0,.08)] flex justify-end gap-2">
              <button onClick={() => { setModal(null); setAmount(''); setNote(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)] hover:bg-[rgba(0,0,0,.04)]">
                Cancel
              </button>
              <button onClick={submit} disabled={saving || !amount}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: modal === 'in' ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}