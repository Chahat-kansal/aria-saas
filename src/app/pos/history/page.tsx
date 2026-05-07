'use client';
import { useState, useEffect, useCallback } from 'react';
import Receipt from '@/components/pos/Receipt';
import type { ReceiptTemplate } from '@/components/pos/Receipt';

interface SaleItem { id: string; product_name: string; quantity: number; unit_price: number; line_total: number; tax_rate: number; discount_percent: number; }
interface Sale {
  id: string; sale_number?: string; total_amount: number; tax_amount?: number;
  payment_method?: string; status?: string; created_at: string;
  served_by?: string | null; customer_id?: string | null;
  pos_customers?: { name: string; email?: string } | null;
  pos_sale_items?: SaleItem[];
}

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#8B5CF6' };
const PAY: Record<string, string> = { card:'#3B82F6', cash:'#22C55E', eftpos:'#38BDF8', split:'#F59E0B' };

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }

export default function HistoryPage() {
  const [sales,    setSales]    = useState<Sale[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [detail,   setDetail]   = useState<Sale | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [from, setFrom]   = useState(() => fmtDate(new Date()));
  const [to,   setTo]     = useState(() => fmtDate(new Date()));
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate | null>(null);
  // Modify details state
  const [editMode, setEditMode] = useState(false);
  const [editServedBy, setEditServedBy] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // Return items state
  const [returnMode, setReturnMode] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<string, boolean>>({});
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pos/reports/sales?from=${from}&to=${to}`);
      const d = await r.json();
      setSales(d.sales ?? []);
    } catch { setSales([]); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Fetch the default receipt template once on mount
  useEffect(() => {
    fetch('/api/pos/receipt-templates')
      .then(r => r.json())
      .then(d => {
        const templates: ReceiptTemplate[] = d.templates || [];
        if (templates.length > 0) {
          const def = templates.find(t => t.is_default) ?? templates[0];
          if (def?.elements?.length) setReceiptTemplate(def);
        }
      })
      .catch(() => null);
  }, []);

  async function loadDetail(sale: Sale) {
    setSelected(sale);
    setDetail(null);
    setDetailLoading(true);
    setEditMode(false); setReturnMode(false); setReturnItems({});
    try {
      const r = await fetch(`/api/pos/sales/${sale.id}`);
      const d = await r.json();
      if (d.sale) { setDetail(d.sale); setEditServedBy(d.sale.served_by ?? ''); setEditNotes(d.sale.notes ?? ''); }
    } catch { setDetail(sale); }
    setDetailLoading(false);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    await fetch(`/api/pos/sales/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ served_by: editServedBy, notes: editNotes }),
    });
    setSaving(false); setEditMode(false);
    if (detail) setDetail({ ...detail, served_by: editServedBy });
  }

  async function processReturn() {
    if (!selected || !detail) return;
    const items = (detail.pos_sale_items ?? [])
      .filter(i => returnItems[i.id])
      .map(i => ({ sale_item_id: i.id, qty: i.quantity }));
    if (!items.length) return;
    setProcessing(true);
    const r = await fetch('/api/pos/sales/return', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_id: selected.id, items, reason: 'Customer return' }),
    });
    const d = await r.json();
    setProcessing(false);
    if (d.refund_sale) { alert(`Refund of A$${Math.abs(d.total).toFixed(2)} processed successfully.`); setReturnMode(false); load(); }
    else alert('Return failed: ' + (d.error ?? 'Unknown error'));
  }

  const filtered = sales.filter(s => {
    const matchSearch = !search || (s.sale_number ?? '').toLowerCase().includes(search.toLowerCase()) || (s.pos_customers as any)?.name?.toLowerCase().includes(search.toLowerCase()) || (s.served_by ?? '').toLowerCase().includes(search.toLowerCase());
    const matchPay = !payFilter || s.payment_method === payFilter;
    return matchSearch && matchPay;
  });

  const totalRev = filtered.reduce((sum, s) => sum + (s.total_amount ?? 0), 0);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Left: list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${C.border}` }}>

        {/* Filters */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 2 }}>Sale History</h1>
              <p style={{ fontSize: 12, color: C.muted }}>{filtered.length} sales · A${totalRev.toFixed(2)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <span style={{ color: C.dim, alignSelf: 'center', fontSize: 12 }}>to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sale #, customer, cashier…" style={{ flex: 1, minWidth: 160, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <select value={payFilter} onChange={e => setPayFilter(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
              <option value="">All payment</option>
              {['card','cash','eftpos','split'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : !filtered.length ? (
            <div style={{ textAlign: 'center', padding: '64px 24px', color: C.dim }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
              <p style={{ fontSize: 14 }}>No sales found for this period</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Try changing the date range or search term</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: 'rgba(26,23,40,0.98)', borderBottom: `1px solid ${C.border}` }}>
                  {['Date/Time','Sale #','Customer','Cashier','Payment','Total'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 16px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const isActive = selected?.id === s.id;
                  return (
                    <tr key={s.id} onClick={() => loadDetail(s)}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: isActive ? 'rgba(139,92,246,0.1)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 100ms' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted }}>
                        {new Date(s.created_at).toLocaleDateString('en-AU')}<br/>
                        <span style={{ fontSize: 10, color: C.dim }}>{new Date(s.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: isActive ? C.violet : '#7C3AED' }}>
                        {s.sale_number ?? s.id.slice(-8).toUpperCase()}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted }}>{(s.pos_customers as any)?.name ?? '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted }}>{s.served_by ?? '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, textTransform: 'capitalize', background: `${PAY[s.payment_method ?? 'card'] ?? C.violet}22`, color: PAY[s.payment_method ?? 'card'] ?? C.violet }}>
                          {s.payment_method ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: C.text }}>
                        A${s.total_amount.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {selected && (
        <div style={{ width: 380, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, background: C.card }}>
          {/* Panel header */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>
                {selected.sale_number ?? selected.id.slice(-8).toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {new Date(selected.created_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · {new Date(selected.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <button onClick={() => { setSelected(null); setDetail(null); }} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
            {detailLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
              </div>
            ) : (
              <>
                {/* Summary */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                  {[
                    ['Status', <span key="s" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>Completed</span>],
                    ['Cashier', detail?.served_by ?? selected.served_by ?? '—'],
                    ['Customer', (detail?.pos_customers as any)?.name ?? '—'],
                    ['Payment', selected.payment_method?.toUpperCase() ?? '—'],
                  ].map(([l, v]) => (
                    <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: C.muted }}>{String(l)}</span>
                      <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Financials */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 10 }}>Financials</p>
                  {[
                    ['Subtotal (excl. GST)', `A$${((selected.total_amount ?? 0) / 1.1).toFixed(2)}`],
                    ['GST (10%)', `A$${((selected.total_amount ?? 0) - (selected.total_amount ?? 0) / 1.1).toFixed(2)}`],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.muted }}>{l}</span>
                      <span style={{ fontSize: 12, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>TOTAL</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>A${(selected.total_amount ?? 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Items */}
                {(detail?.pos_sale_items ?? []).length > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 10 }}>Items</p>
                    {(detail?.pos_sale_items ?? []).map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        {returnMode && (
                          <input type="checkbox" checked={!!returnItems[item.id]} onChange={e => setReturnItems(r => ({ ...r, [item.id]: e.target.checked }))}
                            style={{ flexShrink: 0, width: 14, height: 14, accentColor: C.violet }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                          <div style={{ fontSize: 10, color: C.dim }}>{item.quantity} × A${item.unit_price?.toFixed(2)}</div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>A${item.line_total?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Edit mode */}
                {editMode && (
                  <div style={{ background: 'rgba(139,92,246,0.06)', border: `1px solid rgba(139,92,246,0.2)`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, marginBottom: 10 }}>Modify Details</p>
                    <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 4 }}>Cashier name</label>
                    <input value={editServedBy} onChange={e => setEditServedBy(e.target.value)} placeholder="Cashier name"
                      style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }} />
                    <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 4 }}>Notes</label>
                    <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} placeholder="Notes…"
                      style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => setEditMode(false)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      <button onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Return confirm */}
                {returnMode && Object.values(returnItems).some(Boolean) && (
                  <div style={{ marginBottom: 14 }}>
                    <button onClick={processReturn} disabled={processing}
                      style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: '#EF4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: processing ? 0.5 : 1 }}>
                      {processing ? 'Processing…' : `Return ${Object.values(returnItems).filter(Boolean).length} item(s)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setShowReceipt(true)}
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🖨️ Reprint
              </button>
              <button onClick={() => { setEditMode(e => !e); setReturnMode(false); }}
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                ✏️ Modify
              </button>
            </div>
            <button onClick={() => { setReturnMode(r => !r); setEditMode(false); setReturnItems({}); }}
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.07)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              ↩️ Return Items
            </button>
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {showReceipt && selected && (
        <Receipt
          sale={{ ...selected, served_by: selected.served_by ?? undefined, cartSnapshot: (detail?.pos_sale_items ?? []).map(i => ({ product: { name: i.product_name }, qty: i.quantity, unitPrice: i.unit_price, label: i.product_name, discount_percent: i.discount_percent })) }}
          template={receiptTemplate}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
