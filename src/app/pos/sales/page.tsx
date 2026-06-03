'use client';
import { useState, useEffect } from 'react';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: '#D9D9D9', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#006AFF', green: '#00B140', red: '#EF4444', amber: '#F59E0B' };

interface Sale {
  id: string; total_amount: number; payment_method: string; status: string;
  created_at: string; customer_id: string | null;
  pos_customers?: { name: string } | null;
  pos_sale_items?: { quantity: number; unit_price: number; pos_products?: { name: string } | null }[];
}

const STATUS_COLOR: Record<string, string> = {
  completed: C.violet, pending: C.amber, voided: C.red, refunded: '#38BDF8',
};

function fmt(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' +
    dt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/pos/sales')
      .then(r => r.json())
      .then(d => { setSales(d.sales || []); setLoading(false); });
  }, []);

  const filtered = sales.filter(s => filter === 'all' || s.status === filter);
  const totalRevenue = sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + (s.total_amount || 0), 0);

  const voidSale = async (id: string) => {
    await fetch(`/api/pos/sales?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'voided' }),
    });
    setSales(ss => ss.map(s => s.id === id ? { ...s, status: 'voided' } : s));
    if (selected?.id === id) setSelected(s => s ? { ...s, status: 'voided' } : null);
  };

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '12px 16px', background: 'rgba(26,23,40,0.5)' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>Sales History</h1>
        <p style={{ fontSize: 11, color: C.muted }}>
          {sales.length} total · A${totalRevenue.toFixed(2)} completed revenue
        </p>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {/* Filter pills — horizontally scrollable on mobile */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
          {['all', 'completed', 'pending', 'voided', 'refunded'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontSize: 11, padding: '5px 12px', borderRadius: 99, textTransform: 'capitalize',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                background: filter === f ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: filter === f ? C.violet : C.muted,
                border: `1px solid ${filter === f ? 'rgba(139,92,246,0.4)' : C.border}`,
              }}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 13 }}>Loading sales…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 13 }}>No sales found</div>
        ) : (
          <>
            {/* Sale detail panel — shown above list on mobile when selected */}
            {selected && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>Sale #{selected.id.slice(-6).toUpperCase()}</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>A${selected.total_amount.toFixed(2)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {selected.status !== 'voided' && (
                      <button onClick={() => voidSale(selected.id)}
                        style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: C.red, border: `1px solid rgba(239,68,68,0.3)`, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Void
                      </button>
                    )}
                    <button onClick={() => setSelected(null)}
                      style={{ fontSize: 18, background: 'none', border: 'none', color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Customer', value: selected.pos_customers?.name ?? 'Walk-in' },
                    { label: 'Payment', value: selected.payment_method },
                    { label: 'Status', value: selected.status },
                    { label: 'Time', value: fmt(selected.created_at) },
                  ].map(r => (
                    <div key={r.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>{r.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[r.value] ?? C.text, textTransform: 'capitalize' }}>{r.value}</div>
                    </div>
                  ))}
                </div>
                {(selected.pos_sale_items?.length ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 6 }}>ITEMS</div>
                    {selected.pos_sale_items!.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
                        <span>{item.pos_products?.name ?? 'Item'} × {item.quantity}</span>
                        <span style={{ fontWeight: 600 }}>A${(item.unit_price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sales list — card-per-row on mobile, no table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(s => (
                <div key={s.id} onClick={() => setSelected(selected?.id === s.id ? null : s)}
                  style={{
                    background: C.card, border: `1px solid ${selected?.id === s.id ? C.violet : C.border}`,
                    borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                        padding: '2px 7px', borderRadius: 5,
                        background: `${STATUS_COLOR[s.status] ?? C.muted}18`,
                        color: STATUS_COLOR[s.status] ?? C.muted,
                      }}>{s.status}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>#{s.id.slice(-6).toUpperCase()}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>A${s.total_amount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: C.muted }}>{s.pos_customers?.name ?? 'Walk-in'} · {s.payment_method}</span>
                    <span style={{ fontSize: 10, color: C.dim }}>{fmt(s.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
