'use client';
import { useState } from 'react';
import { useBusiness } from '@/components/providers/BusinessProvider';

interface LineItem { description: string; qty: number; unit_price: number; }
interface Quote { items: LineItem[]; subtotal: number; gst: number; total: number; notes?: string; }

export default function QuoteBuilderPage() {
  const business = useBusiness();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');

  const isPro = business?.plan === 'pro';

  async function generate() {
    if (!prompt.trim() || loading) return;
    setLoading(true); setError(''); setQuote(null);
    const res = await fetch('/api/aria/generate-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: prompt }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Failed to generate quote'); }
    else { setQuote(data.quote); }
    setLoading(false);
  }

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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white mb-1">Quote Builder</h1>
        <p style={{ color: '#6b7280' }}>Describe the job and Aria will generate a professional quote</p>
      </div>

      <div className="rounded-xl p-5 mb-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
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

      {error && <p className="text-sm mb-4" style={{ color: '#ef4444' }}>{error}</p>}

      {quote && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-6 py-4 flex justify-between items-center" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="font-semibold text-white">Quote</h2>
            <button
              onClick={() => window.print()}
              className="text-sm px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
            >
              Print / Save PDF
            </button>
          </div>
          <div className="p-6" style={{ background: '#0d0d14' }}>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Description', 'Qty', 'Unit Price', 'Total'].map(h => (
                    <th key={h} className="py-2 text-left font-medium" style={{ color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="py-3 text-white">{item.description}</td>
                    <td className="py-3" style={{ color: '#9ca3af' }}>{item.qty}</td>
                    <td className="py-3" style={{ color: '#9ca3af' }}>${item.unit_price.toFixed(2)}</td>
                    <td className="py-3 text-white">${(item.qty * item.unit_price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="flex gap-8" style={{ color: '#9ca3af' }}>
                <span>Subtotal</span><span>${quote.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex gap-8" style={{ color: '#9ca3af' }}>
                <span>GST (10%)</span><span>${quote.gst.toFixed(2)}</span>
              </div>
              <div className="flex gap-8 text-base font-semibold text-white mt-1">
                <span>Total</span><span>${quote.total.toFixed(2)}</span>
              </div>
            </div>
            {quote.notes && (
              <p className="mt-4 text-sm" style={{ color: '#6b7280' }}>{quote.notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}