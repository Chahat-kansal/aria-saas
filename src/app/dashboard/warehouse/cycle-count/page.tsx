'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface CountItem { id: string; item_id: string; item_name: string; expected_qty: number; counted_qty: number | null; variance: number | null; status: string; counted_at: string; }

export default function CycleCountPage() {
  const { business } = useBusinessContext();
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const [pending, setPending] = useState<CountItem[]>([]);
  const [history, setHistory] = useState<CountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [pendRes, histRes] = await Promise.all([
      fetch(`/api/warehouse/cycle-count/submit?business_id=${business.id}&status=pending`).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/warehouse/cycle-count/submit?business_id=${business.id}&status=completed`).then(r => r.json()).catch(() => ({ items: [] })),
    ]);
    setPending(pendRes.items ?? []);
    setHistory(histRes.items ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    if (!business?.id) return;
    setGenerating(true);
    await fetch('/api/warehouse/cycle-count/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    });
    setGenerating(false);
    setSubmitted(false);
    setCounts({});
    load();
  }

  async function submitCounts() {
    if (!business?.id || !pending.length) return;
    setSubmitting(true);
    const payload = pending.map(item => ({
      id: item.id,
      item_id: item.item_id,
      counted_qty: counts[item.id] ?? item.expected_qty,
    }));
    await fetch('/api/warehouse/cycle-count/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, counts: payload }),
    });
    setSubmitting(false);
    setSubmitted(true);
    load();
  }

  const varianceItems = history.filter(h => (h.variance ?? 0) !== 0);
  const totalVariance = history.reduce((s, h) => s + (h.variance ?? 0), 0);
  const accuracyRate = history.length ? Math.round((history.filter(h => h.variance === 0).length / history.length) * 100) : 100;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Cycle Count</h1>
          <p style={{ color: '#6b7280' }}>Count high-velocity and long-uncounted items. Aria selects what to count today.</p>
        </div>
        <button onClick={generate} disabled={generating}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center gap-2"
          style={{ background: '#1D9E75' }}>
          {generating ? (
            <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</>
          ) : '✦ Generate Today\'s Count'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Accuracy rate', value: `${accuracyRate}%`, color: accuracyRate >= 95 ? '#1D9E75' : accuracyRate >= 80 ? '#f59e0b' : '#ef4444' },
          { label: 'Items counted (30d)', value: history.length, color: '#fff' },
          { label: 'Total variance', value: totalVariance > 0 ? `+${totalVariance}` : String(totalVariance), color: totalVariance === 0 ? '#1D9E75' : '#ef4444' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{c.label}</p>
            <p className="text-2xl font-semibold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {([['today', `Today's Count (${pending.length})`], ['history', 'History']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={tab === t ? { background: '#1D9E75', color: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <>
          {loading ? (
            <p className="text-sm text-center py-8" style={{ color: '#4b5563' }}>Loading…</p>
          ) : pending.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm" style={{ color: '#6b7280' }}>No pending counts. Click "Generate Today's Count" to begin.</p>
            </div>
          ) : (
            <>
              {submitted && (
                <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.2)' }}>
                  <p className="text-sm" style={{ color: '#1D9E75' }}>Count submitted successfully. Stock levels updated.</p>
                </div>
              )}
              <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Product', 'Expected', 'Counted', 'Variance'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ background: '#0d0d14' }}>
                    {pending.map(item => {
                      const val = counts[item.id] ?? item.expected_qty;
                      const diff = val - item.expected_qty;
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="px-4 py-3 text-white">{item.item_name}</td>
                          <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{item.expected_qty}</td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              value={counts[item.id] ?? item.expected_qty}
                              onChange={e => setCounts(p => ({ ...p, [item.id]: parseInt(e.target.value) || 0 }))}
                              className="w-24 px-2 py-1 rounded-lg text-sm text-white outline-none"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span style={{ color: diff === 0 ? '#1D9E75' : diff > 0 ? '#60a5fa' : '#ef4444' }} className="font-medium">
                              {diff === 0 ? '✓' : diff > 0 ? `+${diff}` : diff}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <button onClick={submitCounts} disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: '#1D9E75' }}>
                  {submitting ? 'Submitting…' : `Submit ${pending.length} counts`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'history' && (
        <>
          {varianceItems.length > 0 && (
            <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Variance items: {varianceItems.length} discrepancies found</p>
            </div>
          )}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Date', 'Product', 'Expected', 'Counted', 'Variance'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ background: '#0d0d14' }}>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No completed counts yet.</td></tr>
                ) : history.map(h => {
                  const v = h.variance ?? 0;
                  return (
                    <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{new Date(h.counted_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-white">{h.item_name}</td>
                      <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{h.expected_qty}</td>
                      <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{h.counted_qty ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span style={{ color: v === 0 ? '#1D9E75' : v > 0 ? '#60a5fa' : '#ef4444' }} className="font-medium">
                          {v === 0 ? '✓' : v > 0 ? `+${v}` : v}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
