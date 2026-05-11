'use client';
import { useState } from 'react';

interface Sale {
  id: string;
  sale_number: string | null;
  created_at: string;
  total_amount: number;
  payment_method: string;
  customer_name: string | null;
  status: string;
}

export default function VoidPage() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<Sale[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [reason, setReason]     = useState('');
  const [processing, setProcessing] = useState(false);
  const [done, setDone]         = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError]       = useState('');

  async function search(q: string) {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/pos/sales?q=${encodeURIComponent(q)}&limit=15`);
      const d = await r.json();
      setResults((d.sales ?? []).filter((s: Sale) => s.status !== 'voided'));
    } catch { setResults([]); }
    setSearching(false);
  }

  async function processVoid() {
    if (!selected) return;
    setProcessing(true); setError('');
    try {
      const res = await fetch(`/api/pos/sales/${selected.id}?action=void`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Operator void' }),
      });
      const d = await res.json();
      if (res.ok) { setDone(true); }
      else { setError(d.error ?? d.message ?? 'Void failed — please try again.'); }
    } catch { setError('Connection error.'); }
    setProcessing(false);
  }

  if (done) return (
    <div style={{ height: '100%', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Sale voided</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
          #{selected?.sale_number ?? selected?.id.slice(-8).toUpperCase()} · A${selected?.total_amount.toFixed(2)} reversed
        </p>
        <button onClick={() => { setDone(false); setSelected(null); setReason(''); setQuery(''); setResults([]); }}
          style={{ padding: '10px 24px', borderRadius: 12, background: 'var(--violet)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
          Void another sale
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-base)', fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(8,12,16,0.9)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Void Sale</h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Search a completed sale to void. Stock is automatically restored for tracked items.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 28, maxWidth: 720, width: '100%' }}>
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input value={query} onChange={e => search(e.target.value)}
            placeholder="Search receipt #, customer name…"
            style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-ui)', boxSizing: 'border-box' }}
            autoFocus />
          {searching && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-tertiary)' }}>Searching…</span>}
        </div>

        {!selected && results.length > 0 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
            {results.map((s, i) => (
              <button key={s.id} onClick={() => { setSelected(s); setError(''); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', background: 'none', border: 'none', borderBottom: i < results.length - 1 ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>#{s.sale_number ?? s.id.slice(-8).toUpperCase()}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{new Date(s.created_at).toLocaleDateString('en-AU')} · {s.customer_name ?? 'Walk-in'}</p>
                </div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>A${s.total_amount.toFixed(2)}</p>
              </button>
            ))}
          </div>
        )}

        {!selected && query.length >= 2 && results.length === 0 && !searching && (
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', textAlign: 'center', paddingTop: 40 }}>No active sales found for &quot;{query}&quot;</p>
        )}

        {selected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>#{selected.sale_number ?? selected.id.slice(-8).toUpperCase()}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{new Date(selected.created_at).toLocaleDateString('en-AU')} · A${selected.total_amount.toFixed(2)} · {selected.payment_method}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)' }}>← Back</button>
            </div>

            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600, marginBottom: 6 }}>This will void the entire sale</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>All tracked inventory will be automatically restored. This action is logged and cannot be undone from the UI.</p>
            </div>

            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Reason (optional)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Customer changed mind, entry error…"
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-ui)', boxSizing: 'border-box', marginBottom: 16 }} />

            {error && <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{error}</p>}

            <button onClick={processVoid} disabled={processing}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.5 : 1, fontFamily: 'var(--font-ui)' }}>
              {processing ? 'Voiding…' : `Void Sale · A$${selected.total_amount.toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
