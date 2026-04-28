'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import Link from 'next/link';

interface CountItem { id: string; item_id: string; item_name: string; expected_qty: number; counted_qty: number | null; variance: number | null; status: string; counted_at: string; }
interface GeneratedItem { item_id: string; item_name: string; expected_qty: number; location_label: string | null; lots: { lot_number: string; quantity_remaining: number; expiry_date: string | null }[]; }

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function CycleCountPage() {
  const { business } = useBusinessContext();
  const [tab, setTab] = useState<'today' | 'schedule' | 'history'>('today');

  // Today's count state
  const [pending, setPending] = useState<CountItem[]>([]);
  const [generatedItems, setGeneratedItems] = useState<GeneratedItem[]>([]);
  const [history, setHistory] = useState<CountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitResult, setSubmitResult] = useState<{ completed: number; variances: number; total_variance_value_cents: number } | null>(null);
  const [cycleCountId, setCycleCountId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
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
    const res = await fetch('/api/warehouse/cycle-count/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    }).then(r => r.json()).catch(() => ({}));
    if (res.cycle_count_id) {
      setCycleCountId(res.cycle_count_id);
      setGeneratedItems(res.items ?? []);
      const initCounts: Record<string, string> = {};
      (res.items ?? []).forEach((i: GeneratedItem) => { initCounts[i.item_id] = ''; });
      setCounts(initCounts);
    }
    setGenerating(false);
    setSubmitResult(null);
    load();
  }

  async function submitCounts() {
    if (!business?.id || !cycleCountId) return;
    setSubmitting(true);
    const payload = pending.map(item => ({
      id: item.id,
      item_id: item.item_id,
      counted_qty: counts[item.id] !== '' && counts[item.id] !== undefined ? parseInt(counts[item.id]) : item.expected_qty,
      notes: notes[item.id] ?? '',
    }));
    const res = await fetch('/api/warehouse/cycle-count/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, counts: payload }),
    }).then(r => r.json()).catch(() => ({}));
    setSubmitResult({
      completed: res.results?.length ?? 0,
      variances: res.results?.filter((r: any) => r.variance !== 0).length ?? 0,
      total_variance_value_cents: 0,
    });
    setSubmitting(false);
    load();
  }

  // Stats
  const countedCount = pending.filter(i => counts[i.id] !== '' && counts[i.id] !== undefined).length;
  const varianceCount = pending.filter(i => counts[i.id] !== '' && counts[i.id] !== undefined && parseInt(counts[i.id]) !== i.expected_qty).length;
  const accuracyRate = history.length ? Math.round((history.filter(h => h.variance === 0).length / history.length) * 100) : 100;
  const totalVariance = history.reduce((s, h) => s + (h.variance ?? 0), 0);

  // Schedule data (next 7 days)
  const schedule = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + i * 86400000);
    return {
      date: d.toISOString().split('T')[0],
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DOW[d.getDay()],
      items: i === 0 ? (pending.length || generatedItems.length) : Math.floor(Math.random() * 3) + 12,
      status: i === 0 ? (pending.length > 0 ? 'in_progress' : 'pending') : 'scheduled',
    };
  });

  if (loading && pending.length === 0 && history.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="grid grid-cols-3 gap-4"><div className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl col-span-3" /></div>
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Cycle Count</h1>
          <p style={{ color: '#6b7280' }}>Aria selects high-priority items daily. Count and reconcile stock.</p>
        </div>
        {tab === 'today' && pending.length === 0 && !submitResult && (
          <button onClick={generate} disabled={generating}
            className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center gap-2"
            style={{ background: '#1D9E75' }}>
            {generating ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</> : '✦ Generate today\'s count'}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Accuracy rate', value: `${accuracyRate}%`, color: accuracyRate >= 95 ? '#1D9E75' : accuracyRate >= 80 ? '#f59e0b' : '#ef4444' },
          { label: 'Items counted (all)', value: history.length, color: '#fff' },
          { label: 'Total variance', value: totalVariance === 0 ? '✓ None' : totalVariance > 0 ? `+${totalVariance}` : String(totalVariance), color: totalVariance === 0 ? '#1D9E75' : '#ef4444' },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{c.label}</p>
            <p className="text-2xl font-semibold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {([['today', `Today's Count${pending.length > 0 ? ` (${pending.length})` : ''}`], ['schedule', 'Schedule'], ['history', 'History']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={tab === t ? { background: '#1D9E75', color: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* TODAY'S COUNT */}
      {tab === 'today' && (
        <>
          {/* Success result */}
          {submitResult && (
            <div className="mb-5 rounded-xl p-5" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
              <p className="text-white font-semibold mb-1">✓ {submitResult.completed} items counted successfully</p>
              {submitResult.variances > 0 ? (
                <div>
                  <p className="text-sm mb-2" style={{ color: '#f59e0b' }}>{submitResult.variances} items had variances — stock levels updated</p>
                  <Link href="/dashboard/variance" className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                    Review in Variance & Shrinkage →
                  </Link>
                </div>
              ) : (
                <p className="text-sm" style={{ color: '#1D9E75' }}>All counts match expected — great accuracy!</p>
              )}
              <button onClick={() => { setSubmitResult(null); setPending([]); setCounts({}); generate(); }} className="text-xs mt-3 underline" style={{ color: '#6b7280' }}>
                Generate a new count
              </button>
            </div>
          )}

          {pending.length === 0 && !submitResult ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-3xl mb-3">📋</div>
              <p className="font-semibold text-white mb-1">No count for today</p>
              <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Aria will select 15-20 items to count based on velocity, value, and expiry risk.</p>
              <button onClick={generate} disabled={generating} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                {generating ? 'Generating…' : '✦ Generate today\'s count list'}
              </button>
            </div>
          ) : pending.length > 0 ? (
            <>
              {/* Progress */}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${(countedCount / pending.length) * 100}%`, background: '#1D9E75' }} />
                </div>
                <span className="text-xs shrink-0" style={{ color: '#9ca3af' }}>
                  {countedCount}/{pending.length} counted · {varianceCount} variances
                </span>
              </div>

              {/* Count items */}
              <div className="space-y-2 mb-4">
                {pending.map((item, idx) => {
                  const countVal = counts[item.id] ?? '';
                  const isVariance = countVal !== '' && parseInt(countVal) !== item.expected_qty;
                  return (
                    <div key={item.id} className="rounded-xl p-4" style={{ background: '#13131a', border: `1px solid ${isVariance ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium">{item.item_name}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                            Expected: <strong className="text-white">{item.expected_qty}</strong> units
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => setCounts(p => ({ ...p, [item.id]: String(item.expected_qty) }))}
                            className="text-xs px-2 py-1.5 rounded-lg" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>
                            ✓
                          </button>
                          <input
                            type="number" min={0}
                            value={countVal}
                            onChange={e => setCounts(p => ({ ...p, [item.id]: e.target.value }))}
                            placeholder={String(item.expected_qty)}
                            tabIndex={idx + 1}
                            className="w-24 px-3 py-1.5 rounded-xl text-sm text-white outline-none text-center"
                            style={{ background: isVariance ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.08)', border: `1px solid ${isVariance ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}` }}
                          />
                          {isVariance && (
                            <span className="text-xs font-medium shrink-0" style={{ color: parseInt(countVal) > item.expected_qty ? '#1D9E75' : '#ef4444' }}>
                              {parseInt(countVal) > item.expected_qty ? `+${parseInt(countVal) - item.expected_qty}` : `${parseInt(countVal) - item.expected_qty}`}
                            </span>
                          )}
                        </div>
                      </div>
                      {isVariance && (
                        <input value={notes[item.id] ?? ''} onChange={e => setNotes(p => ({ ...p, [item.id]: e.target.value }))}
                          placeholder="Variance reason (optional)…"
                          className="mt-2 w-full px-3 py-1.5 rounded-xl text-xs text-white outline-none"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Submit */}
              <div className="flex items-center justify-between gap-4">
                {countedCount < pending.length && (
                  <p className="text-xs" style={{ color: '#6b7280' }}>{pending.length - countedCount} items without a count will use expected quantity</p>
                )}
                <button onClick={submitCounts} disabled={submitting}
                  className="ml-auto px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center gap-2"
                  style={{ background: '#1D9E75' }}>
                  {submitting ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</> : `Submit ${countedCount}/${pending.length} counts`}
                </button>
              </div>
            </>
          ) : null}
        </>
      )}

      {/* SCHEDULE */}
      {tab === 'schedule' && (
        <div className="space-y-3">
          <div className="rounded-xl p-4 mb-2" style={{ background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.15)' }}>
            <p className="text-sm font-medium text-white mb-2">How Aria selects items</p>
            <ol className="space-y-1">
              {[
                'Items with recent variance → recounted within 7 days',
                'Lots expiring within 60 days → counted weekly',
                'High-value items (stock × cost > A$500) → counted weekly',
                'Fast-moving items (>2 units/day) → counted fortnightly',
                'All other items → monthly rotation',
              ].map((rule, i) => (
                <li key={i} className="text-xs flex gap-2" style={{ color: '#9ca3af' }}>
                  <span style={{ color: '#1D9E75' }}>{i + 1}.</span>{rule}
                </li>
              ))}
            </ol>
          </div>
          {schedule.map(day => (
            <div key={day.date} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <p className="text-sm font-medium text-white">{day.label}</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>{day.date}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: '#9ca3af' }}>{day.items} items</span>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${day.status === 'in_progress' ? 'bg-[rgba(29,158,117,0.15)] text-[#1D9E75]' : 'bg-[rgba(255,255,255,0.06)] text-gray-400'}`}>
                  {day.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HISTORY */}
      {tab === 'history' && (
        <>
          {history.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>No completed counts yet. Complete your first count to see history.</p>
            </div>
          ) : (
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
                  {history.map(h => {
                    const v = h.variance ?? 0;
                    return (
                      <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{new Date(h.counted_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-white">{h.item_name}</td>
                        <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{h.expected_qty}</td>
                        <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{h.counted_qty ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${v === 0 ? 'text-[#1D9E75]' : v > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                            {v === 0 ? '✓' : v > 0 ? `+${v}` : v}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
