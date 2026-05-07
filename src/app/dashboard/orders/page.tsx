'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: '#F0F4FF', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

interface OrderItem { product_id: string; product_name: string; barcode: string | null; sku: string | null; category: string; current_stock: number; days_of_stock: number; daily_velocity: number; suggested_qty: number; manual_qty: number | null; unit_cost_cents: number; total_cost_cents: number; reason: string; weather_uplift: number | null; }
interface Draft { id: string; status: string; draft_type: string; items: OrderItem[]; total_cost_cents: number; aria_reasoning: string | null; week_starting: string | null; created_at: string; approved_at: string | null; }

function fmtCents(c: number) { return `A$${(c / 100).toFixed(2)}`; }
function daysColor(d: number) { return d < 3 ? C.red : d < 7 ? C.amber : C.text; }

export default function OrdersPage() {
  const [bid, setBid]               = useState<string | null>(null);
  const [drafts, setDrafts]         = useState<Draft[]>([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [editItems, setEditItems]   = useState<OrderItem[]>([]);
  const [approving, setApproving]   = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      if (d.business_id) { setBid(d.business_id); loadDrafts(d.business_id); }
      else setLoading(false);
    });
  }, []);

  async function loadDrafts(businessId: string) {
    setLoading(true);
    const res = await fetch(`/api/aria/weekly-order?business_id=${businessId}`);
    const d = await res.json();
    const all = d.drafts ?? [];
    setDrafts(all);
    const pending = all.find((dr: Draft) => dr.status === 'pending_approval');
    if (pending) { setActiveDraft(pending); setEditItems(pending.items ?? []); }
    setLoading(false);
  }

  async function generate() {
    if (!bid) return;
    setGenerating(true);
    const res = await fetch('/api/aria/weekly-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) });
    const d = await res.json();
    if (d.draft) {
      setActiveDraft(d.draft);
      setEditItems(d.draft.items ?? []);
      setDrafts(prev => [d.draft, ...prev.filter(dr => dr.id !== d.draft.id)]);
    }
    setGenerating(false);
  }

  async function approve() {
    if (!bid || !activeDraft) return;
    setApproving(true);
    const res = await fetch('/api/aria/weekly-order/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft_id: activeDraft.id, business_id: bid, items: editItems }) });
    const d = await res.json();
    if (d.draft) {
      setActiveDraft(d.draft);
      setDrafts(prev => prev.map(dr => dr.id === d.draft.id ? d.draft : dr));
    }
    setApproving(false);
  }

  async function discard() {
    if (!bid || !activeDraft) return;
    await fetch(`/api/aria/weekly-order/${activeDraft.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, status: 'cancelled' }) });
    setActiveDraft(null);
    setEditItems([]);
    setDrafts(prev => prev.filter(dr => dr.id !== activeDraft.id));
  }

  function setQty(productId: string, qty: number) {
    setEditItems(prev => prev.map(i => i.product_id === productId ? { ...i, manual_qty: qty, total_cost_cents: qty * i.unit_cost_cents } : i));
  }

  const totalEdited = editItems.reduce((s, i) => s + ((i.manual_qty ?? i.suggested_qty) * i.unit_cost_cents), 0);

  const iS = { background: 'rgba(15,20,40,0.9)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', width: 70, textAlign: 'center' as const };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Manrope',system-ui,sans-serif", padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>Weekly Orders</h1>
          <p style={{ fontSize: 14, color: C.muted }}>Aria prepares your order based on sales velocity, stock levels, and upcoming events — you approve it</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/pos/inventory-scan" style={{ padding: '9px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            📱 Mobile Scan Order
          </Link>
          <button onClick={generate} disabled={generating || !bid}
            style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: generating ? 0.6 : 1 }}>
            {generating ? '⏳ Analysing…' : '✨ Generate this week\'s order'}
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: C.dim, fontSize: 13 }}>Loading…</p>
      ) : activeDraft && activeDraft.status === 'pending_approval' ? (
        <>
          {/* Aria reasoning */}
          <div style={{ background: C.card, border: `2px solid rgba(139,92,246,0.4)`, borderRadius: 16, padding: '18px 22px', marginBottom: 24, borderLeft: `4px solid ${C.violet}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.violet, marginBottom: 8 }}>Aria&rsquo;s Analysis</p>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.65 }}>{activeDraft.aria_reasoning}</p>
            <p style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>Generated {new Date(activeDraft.created_at).toLocaleString('en-AU')}</p>
          </div>

          {/* Order table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                    {['Product','Category','In Stock','Days Left','Daily','Suggested','Your Qty','Cost','Total','Why'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 12px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editItems.map((item, i) => {
                    const isUrgent = item.days_of_stock < 3;
                    const isLow    = item.days_of_stock < 7;
                    const myQty    = item.manual_qty ?? item.suggested_qty;
                    return (
                      <tr key={item.product_id} style={{ borderBottom: i < editItems.length - 1 ? `1px solid ${C.border}` : 'none', background: isUrgent ? 'rgba(239,68,68,0.05)' : isLow ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                        <td style={{ padding: '10px 12px', minWidth: 160 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.product_name}</p>
                          <p style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace' }}>{item.sku || item.barcode || '—'}</p>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>{item.category || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: daysColor(item.days_of_stock), fontFamily: 'monospace' }}>{item.current_stock}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: daysColor(item.days_of_stock), fontFamily: 'monospace' }}>{item.days_of_stock.toFixed(1)}</span>
                          {isUrgent && <span style={{ marginLeft: 4, fontSize: 9, padding: '2px 5px', borderRadius: 99, background: 'rgba(239,68,68,0.15)', color: C.red, fontWeight: 700 }}>URGENT</span>}
                          {item.weather_uplift && <span style={{ marginLeft: 4, fontSize: 9, padding: '2px 5px', borderRadius: 99, background: 'rgba(245,158,11,0.12)', color: C.amber }}>🌡️ ×{item.weather_uplift}</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{item.daily_velocity}/day</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: C.muted, fontFamily: 'monospace' }}>{item.suggested_qty}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <input type="number" min="0" value={myQty} onChange={e => setQty(item.product_id, parseInt(e.target.value) || 0)} style={iS} />
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtCents(item.unit_cost_cents)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtCents(myQty * item.unit_cost_cents)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: C.muted, maxWidth: 180 }}>{item.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(139,92,246,0.06)', borderTop: `2px solid rgba(139,92,246,0.2)` }}>
                    <td colSpan={8} style={{ padding: '12px 12px', fontSize: 13, fontWeight: 700, color: C.text }}>TOTAL</td>
                    <td style={{ padding: '12px 12px', fontSize: 16, fontWeight: 800, color: C.violet, fontFamily: 'monospace' }}>{fmtCents(totalEdited)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Approve / discard */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 36 }}>
            <button onClick={approve} disabled={approving}
              style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${C.violet}, #6D28D9)`, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: approving ? 0.6 : 1 }}>
              {approving ? 'Approving…' : `✓ Approve Order — ${fmtCents(totalEdited)}`}
            </button>
            <button onClick={discard}
              style={{ padding: '12px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              ✗ Discard
            </button>
          </div>
        </>
      ) : activeDraft?.status === 'approved' ? (
        <div style={{ background: 'rgba(34,197,94,0.06)', border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 16, padding: '18px 22px', marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.green }}>✓ Order approved — {fmtCents(activeDraft.total_cost_cents)}</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Approved {activeDraft.approved_at ? new Date(activeDraft.approved_at).toLocaleString('en-AU') : ''}</p>
          <button onClick={generate} disabled={generating}
            style={{ marginTop: 12, padding: '8px 18px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Generate next week
          </button>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📦</p>
          <p style={{ color: C.muted, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No order draft for this week</p>
          <p style={{ color: C.dim, fontSize: 13, marginBottom: 20 }}>Click "Generate this week's order" and Aria will analyse your stock levels and sales velocity</p>
          <button onClick={generate} disabled={generating}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {generating ? '⏳ Analysing…' : '✨ Generate order'}
          </button>
        </div>
      )}

      {/* Order history */}
      {drafts.filter(d => d.status === 'approved' || d.status === 'cancelled').length > 0 && (
        <section>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Previous Orders</h2>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {drafts.filter(d => d.status === 'approved' || d.status === 'cancelled').map((d, i, arr) => (
              <div key={d.id} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Week of {d.week_starting ?? new Date(d.created_at).toLocaleDateString('en-AU')}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>{(d.items ?? []).length} items · {fmtCents(d.total_cost_cents)}</p>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: d.status === 'approved' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)', color: d.status === 'approved' ? C.green : C.red }}>{d.status}</span>
                  <span style={{ fontSize: 12, color: C.dim }}>{expandedId === d.id ? '▲' : '▼'}</span>
                </div>
                {expandedId === d.id && (
                  <div style={{ padding: '0 16px 14px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                          {['Product','Qty','Cost','Total'].map(h => <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.dim, padding: '6px 8px' }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {(d.items ?? []).map((item: OrderItem) => (
                          <tr key={item.product_id}>
                            <td style={{ padding: '5px 8px', fontSize: 12, color: C.text }}>{item.product_name}</td>
                            <td style={{ padding: '5px 8px', fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{item.manual_qty ?? item.suggested_qty}</td>
                            <td style={{ padding: '5px 8px', fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{fmtCents(item.unit_cost_cents)}</td>
                            <td style={{ padding: '5px 8px', fontSize: 12, color: C.text, fontFamily: 'monospace' }}>{fmtCents((item.manual_qty ?? item.suggested_qty) * item.unit_cost_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
