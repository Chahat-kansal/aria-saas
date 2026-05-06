'use client';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';
import { useState, useEffect, useCallback } from 'react';

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

  const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] outline-none';

  return (
    <div className="min-h-full">
      <POSAriaInsight page="pos/promotions" />
      <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Promotions</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Create discounts and promotional offers</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#8B5CF6' }}>+ New Promotion</button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[{ label: 'Total', value: promos.length }, { label: 'Active', value: activeCount }, { label: 'Live now', value: liveCount }].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-[rgba(0,0,0,.06)] p-4 shadow-sm">
            <p className="text-xs text-[rgba(26,26,22,.4)] mb-1">{s.label}</p>
            <p className="text-2xl font-semibold text-[#1a1a16]">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[rgba(0,0,0,.06)]">{['Name','Type','Discount','Starts','Ends','Status','Actions'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[rgba(26,26,22,.4)]">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.35)]">Loading…</td></tr>
            : promos.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center"><p className="text-sm font-medium text-[#1a1a16] mb-1">No promotions yet</p><p className="text-xs text-[rgba(26,26,22,.4)]">Create your first promotion to offer discounts at checkout.</p></td></tr>
            : promos.map(p => (
              <tr key={p.id} className="border-b border-[rgba(0,0,0,.04)] hover:bg-[rgba(0,0,0,.015)]">
                <td className="px-4 py-3 font-medium text-[#1a1a16]">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                    {TYPE_LABELS[p.promotion_type] ?? p.promotion_type}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-[#1a1a16]">{discountSummary(p)}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{p.starts_at ? new Date(p.starts_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{p.ends_at ? new Date(p.ends_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(p.id, p.active)} className={`text-xs px-3 py-1 rounded-full font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(p)} className="text-xs px-2 py-1 rounded-lg border border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.5)] hover:bg-gray-50">Edit</button>
                    <button onClick={() => del(p.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors leading-none px-1">×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-[rgba(0,0,0,.08)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[#1a1a16]">{editPromo ? 'Edit Promotion' : 'New Promotion'}</h3>
              <button onClick={() => { setShowAdd(false); setEditPromo(null); setError(null); }} className="text-gray-400 text-xl leading-none">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Summer Sale 10% Off" />
              </div>
              <div>
                <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Type</label>
                <select value={form.promotion_type} onChange={e => setForm(p => ({ ...p, promotion_type: e.target.value }))} className={inputCls + ' bg-white'}>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {form.promotion_type === 'percentage_discount' && (
                <div>
                  <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Discount %</label>
                  <input type="number" min={0} max={100} value={form.discount_percent} onChange={e => setForm(p => ({ ...p, discount_percent: e.target.value }))} className={inputCls} placeholder="10" />
                </div>
              )}
              {form.promotion_type === 'fixed_discount' && (
                <div>
                  <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Discount Amount (A$)</label>
                  <input type="number" min={0} value={form.discount_amount} onChange={e => setForm(p => ({ ...p, discount_amount: e.target.value }))} className={inputCls} placeholder="5.00" />
                </div>
              )}
              {form.promotion_type === 'bundle' && (
                <div>
                  <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Bundle Price (A$)</label>
                  <input type="number" min={0} value={form.bundle_price} onChange={e => setForm(p => ({ ...p, bundle_price: e.target.value }))} className={inputCls} placeholder="25.00" />
                </div>
              )}
              {(form.promotion_type === 'bogo' || form.promotion_type === 'multibuy') && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Buy Qty</label>
                    <input type="number" min={1} value={form.buy_quantity} onChange={e => setForm(p => ({ ...p, buy_quantity: e.target.value }))} className={inputCls} placeholder="2" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">{form.promotion_type === 'bogo' ? 'Get Qty' : 'Discount %'}</label>
                    {form.promotion_type === 'bogo'
                      ? <input type="number" min={1} value={form.get_quantity} onChange={e => setForm(p => ({ ...p, get_quantity: e.target.value }))} className={inputCls} placeholder="1" />
                      : <input type="number" min={0} max={100} value={form.discount_percent} onChange={e => setForm(p => ({ ...p, discount_percent: e.target.value }))} className={inputCls} placeholder="10" />
                    }
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Starts</label>
                  <input type="date" value={form.starts_at} onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Ends</label>
                  <input type="date" value={form.ends_at} onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inputCls} placeholder="Optional notes" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="w-4 h-4 accent-[#8B5CF6]" />
                <span className="text-sm text-[#1a1a16]">Active immediately</span>
              </label>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowAdd(false); setEditPromo(null); setError(null); }} className="flex-1 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] text-[rgba(26,26,22,.5)]">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#8B5CF6' }}>{saving ? 'Saving…' : editPromo ? 'Save Changes' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
