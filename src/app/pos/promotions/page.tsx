'use client';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';
import { useState, useEffect, useCallback } from 'react';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const iStyle: React.CSSProperties = { background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', width: '100%', fontFamily: 'inherit' };
const lStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };

// DB columns: promotion_type, discount_amount, discount_percent, starts_at, ends_at, active
interface Promo {
  id: string;
  name: string;
  promotion_type: string;
  discount_amount: number | null;
  discount_percent: number | null;
  bundle_price: number | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  notes: string | null;
  current_uses?: number | null;
  max_total_uses?: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  multibuy: 'Multibuy',
  percentage_discount: '% Off',
  fixed_discount: 'A$ Off',
  bundle: 'Bundle',
  bogo: 'Buy X Get Y',
};

function discountSummary(p: Promo): string {
  switch (p.promotion_type) {
    case 'percentage_discount': return p.discount_percent != null ? `${p.discount_percent}% off` : '—';
    case 'fixed_discount': return p.discount_amount != null ? `A$${Number(p.discount_amount).toFixed(2)} off` : '—';
    case 'bundle': return p.bundle_price != null ? `Bundle A$${Number(p.bundle_price).toFixed(2)}` : '—';
    case 'bogo': return (p.buy_quantity != null && p.get_quantity != null) ? `Buy ${p.buy_quantity} Get ${p.get_quantity}` : '—';
    case 'multibuy': return (p.buy_quantity != null && p.discount_percent != null) ? `Buy ${p.buy_quantity} @ ${p.discount_percent}% off` : '—';
    default: return '—';
  }
}

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editPromo, setEditPromo] = useState<Promo | null>(null);
  const [form, setForm] = useState({
    name: '',
    promotion_type: 'percentage_discount',
    discount_percent: '',
    discount_amount: '',
    bundle_price: '',
    buy_quantity: '',
    get_quantity: '',
    starts_at: '',
    ends_at: '',
    active: true,
    notes: '',
  });

  const load = useCallback(() => {
    fetch('/api/pos/promotions').then(r => r.json()).then(d => { setPromos(d.promotions ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const [error, setError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<Record<string, unknown> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  async function getAiSuggestion() {
    setAiLoading(true);
    try {
      const res = await fetch('/api/aria/promo-suggest', { method: 'POST' });
      const d = await res.json();
      setAiSuggestion(d.suggestion ?? null);
    } catch { /* silent */ }
    setAiLoading(false);
  }

  function openAdd() {
    setEditPromo(null);
    setForm({ name: '', promotion_type: 'percentage_discount', discount_percent: '', discount_amount: '', bundle_price: '', buy_quantity: '', get_quantity: '', starts_at: '', ends_at: '', active: true, notes: '' });
    setError(null);
    setShowAdd(true);
  }

  function openEdit(p: Promo) {
    setEditPromo(p);
    setForm({
      name: p.name,
      promotion_type: p.promotion_type,
      discount_percent: p.discount_percent != null ? String(p.discount_percent) : '',
      discount_amount: p.discount_amount != null ? String(p.discount_amount) : '',
      bundle_price: p.bundle_price != null ? String(p.bundle_price) : '',
      buy_quantity: p.buy_quantity != null ? String(p.buy_quantity) : '',
      get_quantity: p.get_quantity != null ? String(p.get_quantity) : '',
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : '',
      ends_at: p.ends_at ? p.ends_at.slice(0, 10) : '',
      active: p.active,
      notes: p.notes ?? '',
    });
    setError(null);
    setShowAdd(true);
  }

  async function save() {
    if (!form.name) return;
    setSaving(true); setError(null);
    const payload: Record<string, unknown> = {
      name: form.name,
      promotion_type: form.promotion_type,
      discount_percent: form.discount_percent ? parseFloat(form.discount_percent) : null,
      discount_amount: form.discount_amount ? parseFloat(form.discount_amount) : null,
      bundle_price: form.bundle_price ? parseFloat(form.bundle_price) : null,
      buy_quantity: form.buy_quantity ? parseInt(form.buy_quantity) : null,
      get_quantity: form.get_quantity ? parseInt(form.get_quantity) : null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      active: form.active,
      notes: form.notes || null,
    };

    const method = editPromo ? 'PATCH' : 'POST';
    const url = editPromo ? `/api/pos/promotions?id=${editPromo.id}` : '/api/pos/promotions';

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    setSaving(false);
    if (d.error) { setError(d.error); return; }
    load();
    setShowAdd(false);
    setEditPromo(null);
  }

  async function toggle(id: string, cur: boolean) {
    // DB column is 'active' not 'is_active'
    setPromos(prev => prev.map(p => p.id === id ? { ...p, active: !cur } : p));
    const r = await fetch(`/api/pos/promotions?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !cur }),
    });
    if (!r.ok) load(); // revert on failure
  }

  async function del(id: string) {
    if (!confirm('Delete this promotion?')) return;
    setPromos(prev => prev.filter(p => p.id !== id));
    await fetch(`/api/pos/promotions?id=${id}`, { method: 'DELETE' });
  }

  const now = new Date();
  const activeCount = promos.filter(p => p.active).length;
  const liveCount = promos.filter(p => p.active && (!p.starts_at || new Date(p.starts_at) <= now) && (!p.ends_at || new Date(p.ends_at) >= now)).length;

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <POSAriaInsight page="pos/promotions" />
      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Promotions</h1>
            <p style={{ fontSize: 12, color: C.muted }}>Create discounts and promotional offers</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={getAiSuggestion} disabled={aiLoading}
              style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.08)', color: C.violet, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: aiLoading ? 0.6 : 1 }}>
              {aiLoading ? 'Aria thinking…' : '✨ AI Suggest'}
            </button>
            <button onClick={openAdd}
              style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              + New Promotion
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
          {[{ label: 'Total', value: promos.length }, { label: 'Active', value: activeCount }, { label: 'Live now', value: liveCount }].map(s => (
            <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
              <p style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* AI suggestion card — Sprint Intel v2 field names */}
        {(() => {
          const s = aiSuggestion
          const typeLabels: Record<string, string> = { percent_off: 'Discount', fixed_off: 'Fixed off', bogo: 'Buy one get one', bundle: 'Bundle', tiered: 'Tiered' }
          const isActionable = !!(s && s.type && s.type !== 'none' && s.title && String(s.title).trim().length > 0)
          if (!isActionable) return null
          const impact = Number(s!.estimated_impact) || 0
          const payload = (s!.payload as Record<string, unknown> | null) ?? {}
          return (
            <div style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>✨ Aria Suggestion</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{String(s!.title)}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px' }}>{String(s!.description ?? payload.rationale ?? '')}</p>
                  <p style={{ fontSize: 11, color: C.dim, margin: 0 }}>
                    {typeLabels[String(s!.type)] ?? String(s!.type)}
                    {impact > 0 ? ` · Est. +A$${impact.toFixed(0)} revenue` : ''}
                    {s!.confidence ? ` · ${String(s!.confidence)} confidence` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => { sessionStorage.setItem('aria_promo_suggestion', JSON.stringify(s)); window.location.href = '/pos/promotions/new'; }}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Create this
                  </button>
                  <button onClick={() => setAiSuggestion(null)}
                    style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Table */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Name', 'Type', 'Discount', 'Uses', 'Starts', 'Ends', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</td></tr>
              ) : promos.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>No promotions yet</p>
                  <p style={{ fontSize: 12, color: C.muted }}>Create your first promotion to offer discounts at checkout.</p>
                </td></tr>
              ) : promos.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < promos.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, fontWeight: 700, background: 'rgba(139,92,246,0.12)', color: C.violet, border: '1px solid rgba(139,92,246,0.25)' }}>
                      {TYPE_LABELS[p.promotion_type] ?? p.promotion_type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{discountSummary(p)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, color: C.muted }}>
                      {(p.current_uses ?? 0)}{p.max_total_uses ? ` / ${p.max_total_uses}` : ' uses'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted }}>{p.starts_at ? new Date(p.starts_at).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: C.muted }}>{p.ends_at ? new Date(p.ends_at).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => toggle(p.id, p.active)}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 99, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: p.active ? 'rgba(34,197,94,0.15)' : 'rgba(74,69,101,0.3)', color: p.active ? C.green : C.muted }}>
                      {p.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => openEdit(p)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Edit
                      </button>
                      <button onClick={() => del(p.id)}
                        style={{ fontSize: 13, background: 'none', border: 'none', color: C.red, cursor: 'pointer', lineHeight: 1 }}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showAdd && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
            <div style={{ background: '#0F0D1C', border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{editPromo ? 'Edit Promotion' : 'New Promotion'}</h3>
                <button onClick={() => { setShowAdd(false); setEditPromo(null); setError(null); }}
                  style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
              </div>
              <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lStyle}>Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    style={iStyle} placeholder="e.g. Summer Sale 10% Off" />
                </div>
                <div>
                  <label style={lStyle}>Type</label>
                  <select value={form.promotion_type} onChange={e => setForm(p => ({ ...p, promotion_type: e.target.value }))}
                    style={{ ...iStyle, background: 'var(--bg-base)' }}>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v} style={{ background: 'var(--bg-base)', color: C.text }}>{l}</option>
                    ))}
                  </select>
                </div>

                {form.promotion_type === 'percentage_discount' && (
                  <div>
                    <label style={lStyle}>Discount %</label>
                    <input type="number" min={0} max={100} value={form.discount_percent}
                      onChange={e => setForm(p => ({ ...p, discount_percent: e.target.value }))}
                      style={iStyle} placeholder="10" />
                  </div>
                )}
                {form.promotion_type === 'fixed_discount' && (
                  <div>
                    <label style={lStyle}>Discount Amount (A$)</label>
                    <input type="number" min={0} value={form.discount_amount}
                      onChange={e => setForm(p => ({ ...p, discount_amount: e.target.value }))}
                      style={iStyle} placeholder="5.00" />
                  </div>
                )}
                {form.promotion_type === 'bundle' && (
                  <div>
                    <label style={lStyle}>Bundle Price (A$)</label>
                    <input type="number" min={0} value={form.bundle_price}
                      onChange={e => setForm(p => ({ ...p, bundle_price: e.target.value }))}
                      style={iStyle} placeholder="25.00" />
                  </div>
                )}
                {(form.promotion_type === 'bogo' || form.promotion_type === 'multibuy') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={lStyle}>Buy Qty</label>
                      <input type="number" min={1} value={form.buy_quantity}
                        onChange={e => setForm(p => ({ ...p, buy_quantity: e.target.value }))}
                        style={iStyle} placeholder="2" />
                    </div>
                    <div>
                      <label style={lStyle}>{form.promotion_type === 'bogo' ? 'Get Qty' : 'Discount %'}</label>
                      {form.promotion_type === 'bogo'
                        ? <input type="number" min={1} value={form.get_quantity}
                            onChange={e => setForm(p => ({ ...p, get_quantity: e.target.value }))}
                            style={iStyle} placeholder="1" />
                        : <input type="number" min={0} max={100} value={form.discount_percent}
                            onChange={e => setForm(p => ({ ...p, discount_percent: e.target.value }))}
                            style={iStyle} placeholder="10" />
                      }
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={lStyle}>Starts</label>
                    <input type="date" value={form.starts_at}
                      onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))}
                      style={iStyle} />
                  </div>
                  <div>
                    <label style={lStyle}>Ends</label>
                    <input type="date" value={form.ends_at}
                      onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))}
                      style={iStyle} />
                  </div>
                </div>

                <div>
                  <label style={lStyle}>Notes</label>
                  <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    style={iStyle} placeholder="Optional notes" />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.active}
                    onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
                    style={{ accentColor: C.violet, width: 14, height: 14 }} />
                  <span style={{ fontSize: 13, color: C.text }}>Active immediately</span>
                </label>

                {error && (
                  <p style={{ fontSize: 12, color: C.red, background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '8px 12px' }}>{error}</p>
                )}
              </div>
              <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowAdd(false); setEditPromo(null); setError(null); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={save} disabled={saving || !form.name}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !form.name ? 0.5 : 1 }}>
                  {saving ? 'Saving…' : editPromo ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
