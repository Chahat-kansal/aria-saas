'use client';
import { useState, useEffect } from 'react';

interface GiftCard { id: string; code: string; initial_balance: number; current_balance: number; status: string; created_at: string; expires_at: string | null; }

export default function GiftCardsPage() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showIssue, setShowIssue] = useState(false);
  const [amount, setAmount] = useState('');
  const [expiry, setExpiry] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<GiftCard | null>(null);

  const load = () => fetch('/api/pos/gift-cards').then(r => r.json()).then(d => { setCards(d.gift_cards ?? []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function issueCard() {
    if (!amount || parseFloat(amount) <= 0) return;
    setIssuing(true);
    const res = await fetch('/api/pos/gift-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initial_balance: Math.round(parseFloat(amount) * 100), expires_at: expiry || null }) }).then(r => r.json());
    setIssuing(false);
    if (res.gift_card) { setIssued(res.gift_card); setCards(c => [res.gift_card, ...c]); setAmount(''); setExpiry(''); setShowIssue(false); }
  }

  const filtered = cards.filter(c => !search || c.code.toLowerCase().includes(search.toLowerCase()));
  const activeCount = cards.filter(c => c.status === 'active').length;
  const totalBalance = cards.filter(c => c.status === 'active').reduce((s, c) => s + c.current_balance, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Gift Cards</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Issue and manage gift cards for customers</p>
        </div>
        <button onClick={() => setShowIssue(true)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#1D9E75' }}>+ Issue Gift Card</button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[{ label: 'Active cards', value: activeCount }, { label: 'Total issued', value: cards.length }, { label: 'Outstanding', value: `A$${(totalBalance / 100).toFixed(2)}` }].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-[rgba(0,0,0,.06)] p-4 shadow-sm">
            <p className="text-xs text-[rgba(26,26,22,.4)] mb-1">{s.label}</p>
            <p className="text-2xl font-semibold text-[#1a1a16]">{s.value}</p>
          </div>
        ))}
      </div>

      {issued && (
        <div className="mb-4 rounded-xl px-5 py-4 flex items-center justify-between" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
          <p className="text-sm" style={{ color: '#1D9E75' }}>Gift card issued! Code: <strong className="font-mono">{issued.code}</strong> · Balance: A${(issued.initial_balance / 100).toFixed(2)}</p>
          <button onClick={() => setIssued(null)} className="text-xs text-gray-400">✕</button>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by code…" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-white border border-[rgba(0,0,0,.1)] mb-4" />

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[rgba(0,0,0,.06)]">{['Code','Initial','Current','Issued','Expires','Status'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[rgba(26,26,22,.4)]">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.35)]">Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center"><p className="text-sm font-medium text-[#1a1a16] mb-1">No gift cards yet</p><p className="text-xs text-[rgba(26,26,22,.4)]">Click &quot;Issue Gift Card&quot; to get started.</p></td></tr>
            : filtered.map(card => (
              <tr key={card.id} className="border-b border-[rgba(0,0,0,.04)] hover:bg-[rgba(0,0,0,.015)]">
                <td className="px-4 py-3 font-mono font-bold text-[#1a1a16]">{card.code}</td>
                <td className="px-4 py-3 text-[rgba(26,26,22,.6)]">A${(card.initial_balance/100).toFixed(2)}</td>
                <td className="px-4 py-3 font-semibold text-[#1a1a16]">A${(card.current_balance/100).toFixed(2)}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{new Date(card.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{card.expires_at ? new Date(card.expires_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${card.status === 'active' ? 'bg-green-100 text-green-700' : card.status === 'expired' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{card.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showIssue && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[rgba(0,0,0,.08)]">
            <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-[#1a1a16]">Issue Gift Card</h3><button onClick={() => setShowIssue(false)} className="text-gray-400">×</button></div>
            <div className="space-y-3">
              <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Amount (A$) *</label><input type="number" min={1} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] outline-none" placeholder="50.00" /></div>
              <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Expiry (optional)</label><input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] outline-none" /></div>
              <p className="text-xs text-[rgba(26,26,22,.4)]">A unique code (e.g. GC-ABCD-EFGH) will be auto-generated.</p>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowIssue(false)} className="flex-1 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] text-[rgba(26,26,22,.5)]">Cancel</button>
              <button onClick={issueCard} disabled={issuing || !amount} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>{issuing ? 'Issuing…' : 'Issue card'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
