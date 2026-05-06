'use client';
import { useState, useEffect } from 'react';

const C = { bg: 'rgba(17,15,26,0.95)', card: 'rgba(26,23,40,0.9)', border: '#2A2540', text: '#EDE8FF', muted: '#8B85A8', dim: '#4A4565', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

interface Sale {
  id: string; total_amount: number; payment_method: string; status: string;
  created_at: string; customer_id: string | null;
  pos_customers?: { name: string } | null;
  pos_sale_items?: { quantity: number; unit_price: number; pos_products?: { name: string } | null }[];
}

const STATUS_COLOR: Record<string, string> = {
  completed: C.violet,
  pending:   C.amber,
  voided:    C.red,
  refunded:  '#38BDF8',
};

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
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 24px', background: 'rgba(26,23,40,0.5)' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 2 }}>Sales History</h1>
        <p style={{ fontSize: 12, color: C.muted }}>
          {sales.length} total · A${totalRevenue.toFixed(2)} completed revenue
        </p>
      </div>

      <div style={{ padding: '16px 24px' }}>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {['all', 'completed', 'pending', 'voided', 'refunded'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontSize: 11, padding: '5px 12px', borderRadius: 99, textTransform: 'capitalize', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                background: filter === f ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: filter === f ? C.violet : C.muted,
                border: `1px solid ${filter === f ? 'rgba(139,92,246,0.4)' : C.border}`,
              }}>
              {f}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {/* Table */}
          <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                  {['Sale ID', 'Customer', 'Total', 'Payment', 'Status', 'Time'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', fontSize: 13, color: C.dim }}>Loading…</td></tr>
                ) : !filtered.length ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', fontSize: 13, color: C.dim }}>No sales found</td></tr>
                ) : (
                  filtered.map((s, i) => (
                    <tr key={s.id}
                      onClick={() => setSelected(selected?.id === s.id ? null : s)}
                      style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', background: selected?.id === s.id ? 'rgba(139,92,246,0.06)' : 'transparent' }}>
                      <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: C.muted }}>
                        #{s.id.slice(-8).toUpperCase()}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: C.text }}>
                        {s.pos_customers?.name || 'Walk-in'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: C.text }}>
                        A${Number(s.total_amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted, textTransform: 'capitalize' }}>
                        {s.payment_method || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700, textTransform: 'capitalize',
                          color: STATUS_COLOR[s.status] ?? C.muted,
                          background: `${STATUS_COLOR[s.status] ?? C.muted}18`,
                          border: `1px solid ${STATUS_COLOR[s.status] ?? C.muted}30`,
                        }}>{s.status}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: C.dim }}>
                        {new Date(s.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ width: 240, flexShrink: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Sale detail</h3>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
              </div>
              <p style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono',monospace", marginBottom: 12 }}>
                #{selected.id.slice(-12).toUpperCase()}
              </p>

              {selected.pos_sale_items?.length ? (
                <ul style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.pos_sale_items.map((item, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: C.muted }}>{item.pos_products?.name || 'Product'} ×{item.quantity}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", color: C.text, fontWeight: 600 }}>
                        A${(item.unit_price * item.quantity).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p style={{ fontSize: 11, color: C.dim, marginBottom: 14 }}>No line items</p>}

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Total</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: C.text }}>
                  A${Number(selected.total_amount).toFixed(2)}
                </span>
              </div>

              {selected.status === 'completed' && (
                <button onClick={() => voidSale(selected.id)}
                  style={{ width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, color: C.red, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.06)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Void sale
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
