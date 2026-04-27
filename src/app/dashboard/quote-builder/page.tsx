'use client';
import { useState, useEffect } from 'react';
import { useBusiness } from '@/components/providers/BusinessProvider';

interface LineItem { description: string; qty: number; rate: number; total: number; }
interface QuoteData {
  quoteNumber: string; businessName: string; date: string; validUntil: string;
  lineItems: LineItem[]; subtotal: number; gst: number; total: number;
  notes?: string; terms?: string;
}
interface SavedQuote {
  id: string; job_description: string; quote_amount: number;
  quote_breakdown: QuoteData; status: string; customer_name: string | null;
  generated_at: string; created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  draft:    { bg: 'rgba(255,255,255,0.06)',   color: '#9ca3af' },
  sent:     { bg: 'rgba(59,130,246,0.15)',    color: '#60a5fa' },
  accepted: { bg: 'rgba(29,158,117,0.15)',    color: '#1D9E75' },
  rejected: { bg: 'rgba(239,68,68,0.15)',     color: '#ef4444' },
  expired:  { bg: 'rgba(245,158,11,0.15)',    color: '#f59e0b' },
};

export default function QuoteBuilderPage() {
  const business = useBusiness();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SavedQuote[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<SavedQuote | null>(null);

  const isPro = business?.plan === 'pro';

  useEffect(() => {
    if (!isPro) return;
    fetch('/api/aria/generate-quote')
      .then(r => r.json())
      .then(d => { setHistory(d.quotes ?? []); setHistoryLoading(false); })
      .catch(() => setHistoryLoading(false));
  }, [isPro]);

  async function generate() {
    if (!prompt.trim() || loading) return;
    setLoading(true); setError(''); setQuote(null); setSavedId(null); setSelectedQuote(null);
    const res = await fetch('/api/aria/generate-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription: prompt }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to generate quote');
    } else {
      setQuote(data.quote);
      if (data.id) {
        setSavedId(data.id);
        setHistory(h => [{
          id: data.id, job_description: prompt, quote_amount: data.quote.total,
          quote_breakdown: data.quote, status: 'draft', customer_name: null,
          generated_at: new Date().toISOString(), created_at: new Date().toISOString(),
        }, ...h]);
      }
    }
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/aria/generate-quote?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setHistory(h => h.map(q => q.id === id ? { ...q, status } : q));
    if (selectedQuote?.id === id) setSelectedQuote(q => q ? { ...q, status } : q);
  }

  const displayQuote = selectedQuote?.quote_breakdown ?? quote;

  if (!isPro) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-white mb-2">Quote Builder</h1>
        <div className="rounded-xl p-8 text-center mt-8" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-white font-medium mb-2">Pro Plan Required</p>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            AI quote generation is available on the Pro plan. Upgrade to start generating professional quotes in seconds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Quote Builder</h1>
        <p style={{ color: '#6b7280' }}>Describe the job and Aria will generate a professional quote</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — generator + result */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Replace bathroom tiles in a 10m² space, supply and install, includes waterproofing and grout..."
              rows={4}
              className="w-full text-sm outline-none resize-none"
              style={{ background: 'transparent', color: '#fff' }}
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#1D9E75', color: '#fff' }}
              >
                {loading ? 'Generating...' : 'Generate Quote'}
              </button>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>}

          {displayQuote && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-6 py-4 flex justify-between items-center" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <h2 className="font-semibold text-white">{displayQuote.quoteNumber}</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Valid until {displayQuote.validUntil}</p>
                </div>
                <div className="flex items-center gap-2">
                  {(savedId || selectedQuote) && (
                    <select
                      value={selectedQuote?.status ?? 'draft'}
                      onChange={e => updateStatus((selectedQuote?.id ?? savedId)!, e.target.value)}
                      className="text-xs rounded-lg px-2 py-1.5 outline-none"
                      style={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
                    >
                      {['draft','sent','accepted','rejected','expired'].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => window.print()}
                    className="text-sm px-3 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
                  >
                    Print / PDF
                  </button>
                </div>
              </div>
              <div className="p-6" style={{ background: '#0d0d14' }}>
                <table className="w-full text-sm mb-6">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Description', 'Qty', 'Rate', 'Total'].map(h => (
                        <th key={h} className="py-2 text-left font-medium" style={{ color: '#6b7280' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayQuote.lineItems.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="py-3 text-white">{item.description}</td>
                        <td className="py-3" style={{ color: '#9ca3af' }}>{item.qty}</td>
                        <td className="py-3" style={{ color: '#9ca3af' }}>${item.rate?.toFixed(2) ?? '0.00'}</td>
                        <td className="py-3 text-white">${item.total?.toFixed(2) ?? '0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-col items-end gap-1 text-sm">
                  <div className="flex gap-8" style={{ color: '#9ca3af' }}>
                    <span>Subtotal</span><span>${displayQuote.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-8" style={{ color: '#9ca3af' }}>
                    <span>GST (10%)</span><span>${displayQuote.gst.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-8 text-base font-semibold text-white mt-1">
                    <span>Total</span><span>${displayQuote.total.toFixed(2)}</span>
                  </div>
                </div>
                {displayQuote.notes && (
                  <p className="mt-4 text-sm" style={{ color: '#6b7280' }}>{displayQuote.notes}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right — quote history */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Quote History</h3>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-xl p-6 text-center text-sm" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}>
              No quotes yet. Generate your first quote.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(q => {
                const style = STATUS_STYLES[q.status] ?? STATUS_STYLES.draft;
                const isSelected = selectedQuote?.id === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => { setSelectedQuote(q); setQuote(null); setSavedId(null); }}
                    className="w-full text-left rounded-xl p-4 transition-colors"
                    style={{
                      background: isSelected ? 'rgba(29,158,117,0.08)' : '#13131a',
                      border: `1px solid ${isSelected ? 'rgba(29,158,117,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    }}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-xs font-medium text-white truncate flex-1">
                        {q.job_description.slice(0, 50)}{q.job_description.length > 50 ? '…' : ''}
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: style.bg, color: style.color }}>
                        {q.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1.5">
                      <p className="text-xs font-semibold" style={{ color: '#1D9E75' }}>
                        ${q.quote_amount.toFixed(2)}
                      </p>
                      <p className="text-[10px]" style={{ color: '#6b7280' }}>
                        {new Date(q.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
