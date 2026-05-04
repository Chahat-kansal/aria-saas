'use client';
import { useState } from 'react';

interface SaleItem { id: string; product_name: string; quantity: number; unit_price: number; line_total: number; }
interface Sale { id: string; sale_number: string | null; created_at: string; total_amount: number; payment_method: string; customer_name: string | null; items: SaleItem[]; }

export default function VoidPage() {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<Sale[]>([]);
  const [selected, setSelected]     = useState<Sale | null>(null);
  const [refundItems, setRefundItems] = useState<Record<string, boolean>>({});
  const [processing, setProcessing] = useState(false);
  const [done, setDone]             = useState(false);
  const [searching, setSearching]   = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/pos/sales?q=${encodeURIComponent(q)}&limit=15`);
      const d = await r.json();
      setResults(d.sales ?? []);
    } catch { setResults([]); }
    setSearching(false);
  }

  async function processRefund() {
    if (!selected) return;
    const items = selected.items.filter(i => refundItems[i.id]);
    if (!items.length) return;
    setProcessing(true);
    try {
      const refundTotal = items.reduce((s, i) => s + (i.line_total ?? 0), 0);
      const res = await fetch('/api/pos/sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ product_id: undefined, product_name: i.product_name, quantity: -Math.abs(i.quantity), unit_price: i.unit_price, tax_rate: 10, discount_percent: 0, line_total: -Math.abs(i.line_total) })),
          payment_method: selected.payment_method ?? 'card',
          subtotal: -refundTotal, tax_amount: -(refundTotal - refundTotal / 1.1),
          discount_amount: 0, total_amount: -refundTotal,
          original_sale_id: selected.id,
          notes: `Refund for sale ${selected.sale_number ?? selected.id.slice(-8)}`,
        }),
      });
      if (res.ok) { setDone(true); }
      else { alert('Refund failed — please try again.'); }
    } catch { alert('Connection error.'); }
    setProcessing(false);
  }

  const refundTotal = (selected?.items ?? []).filter(i => refundItems[i.id]).reduce((s, i) => s + (i.line_total ?? 0), 0);

  if (done) return (
    <div style={{ height: '100%', background: 'var(--pos-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--pos-font-ui)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, color: 'var(--pos-success,#10B981)', marginBottom: 16 }}>✓</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--pos-text-primary)', marginBottom: 8 }}>Refund processed</h2>
        <p style={{ fontSize: 14, color: 'var(--pos-text-secondary)', marginBottom: 24 }}>A${refundTotal.toFixed(2)} refunded via {selected?.payment_method ?? 'original method'}</p>
        <button onClick={() => { setDone(false); setSelected(null); setRefundItems({}); setQuery(''); setResults([]); }}
          style={{ padding: '10px 24px', borderRadius: 12, background: 'var(--pos-teal)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--pos-font-ui)' }}>
          Process another refund
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--pos-base)', fontFamily: 'var(--pos-font-ui)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 28px', borderBottom: '1px solid var(--pos-border-subtle)', background: 'rgba(8,12,16,0.9)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--pos-text-primary)', marginBottom: 2 }}>Void & Refund</h1>
        <p style={{ fontSize: 13, color: 'var(--pos-text-tertiary)' }}>Search a sale by receipt number or customer name</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 28, maxWidth: 720, width: '100%' }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input value={query} onChange={e => search(e.target.value)}
            placeholder="Search receipt #, customer name…"
            style={{ width: '100%', background: 'var(--pos-surface)', border: '1px solid var(--pos-border-default)', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: 'var(--pos-text-primary)', outline: 'none', fontFamily: 'var(--pos-font-ui)', boxSizing: 'border-box' }}
            autoFocus />
          {searching && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--pos-text-tertiary)' }}>Searching…</span>}
        </div>

        {/* Results list */}
        {!selected && results.length > 0 && (
          <div style={{ background: 'var(--pos-surface)', border: '1px solid var(--pos-border-default)', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
            {results.map((s, i) => (
              <button key={s.id} onClick={() => { setSelected(s); setRefundItems({}); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', background: 'none', border: 'none', borderBottom: i < results.length - 1 ? '1px solid var(--pos-border-subtle)' : 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 150ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--pos-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pos-text-primary)', marginBottom: 2 }}>
                    #{s.sale_number ?? s.id.slice(-8).toUpperCase()}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--pos-text-tertiary)' }}>
                    {new Date(s.created_at).toLocaleDateString('en-AU')} · {s.customer_name ?? 'Walk-in'}
                  </p>
                </div>
                <p style={{ fontFamily: 'var(--pos-font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--pos-text-primary)' }}>A${s.total_amount.toFixed(2)}</p>
              </button>
            ))}
          </div>
        )}

        {!selected && query.length >= 2 && results.length === 0 && !searching && (
          <p style={{ fontSize: 14, color: 'var(--pos-text-tertiary)', textAlign: 'center', paddingTop: 40 }}>No sales found for &quot;{query}&quot;</p>
        )}

        {/* Selected sale */}
        {selected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--pos-text-primary)' }}>#{selected.sale_number ?? selected.id.slice(-8).toUpperCase()}</p>
                <p style={{ fontSize: 12, color: 'var(--pos-text-tertiary)' }}>{new Date(selected.created_at).toLocaleDateString('en-AU')} · A${selected.total_amount.toFixed(2)} · {selected.payment_method}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--pos-text-tertiary)', fontFamily: 'var(--pos-font-ui)' }}>← Back</button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--pos-text-tertiary)', marginBottom: 10, fontFamily: 'var(--pos-font-ui)' }}>Select items to refund:</p>
            <div style={{ background: 'var(--pos-surface)', border: '1px solid var(--pos-border-default)', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
              {(selected.items ?? []).map((item, i) => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < selected.items.length - 1 ? '1px solid var(--pos-border-subtle)' : 'none', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!refundItems[item.id]} onChange={e => setRefundItems(r => ({ ...r, [item.id]: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--pos-teal)' }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, color: 'var(--pos-text-primary)', fontWeight: 500 }}>{item.product_name}</p>
                    <p style={{ fontSize: 12, color: 'var(--pos-text-tertiary)' }}>qty {item.quantity} × A${(item.unit_price ?? 0).toFixed(2)}</p>
                  </div>
                  <p style={{ fontFamily: 'var(--pos-font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--pos-text-primary)' }}>A${(item.line_total ?? 0).toFixed(2)}</p>
                </label>
              ))}
            </div>

            {refundTotal > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 14, color: 'var(--pos-text-secondary)', fontFamily: 'var(--pos-font-ui)' }}>Refund total</p>
                <p style={{ fontFamily: 'var(--pos-font-mono)', fontSize: 20, fontWeight: 800, color: '#EF4444' }}>A${refundTotal.toFixed(2)}</p>
              </div>
            )}

            <button onClick={processRefund} disabled={processing || refundTotal === 0}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: (processing || refundTotal === 0) ? 'not-allowed' : 'pointer', opacity: (processing || refundTotal === 0) ? 0.5 : 1, fontFamily: 'var(--pos-font-ui)' }}>
              {processing ? 'Processing…' : `Process Refund · A$${refundTotal.toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
