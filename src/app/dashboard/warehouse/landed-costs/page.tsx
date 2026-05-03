'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface LandedCost {
  id: string;
  grn_id: string | null;
  cost_type: string;
  description: string | null;
  amount_cents: number;
  allocation_method: string | null;
  notes: string | null;
  created_at: string;
}

interface LandedCostForm {
  grn_id: string;
  cost_type: string;
  description: string;
  amount: string;
  allocation_method: string;
  notes: string;
}

const COST_TYPES = ['freight', 'customs', 'duties', 'insurance', 'handling', 'other'];
const ALLOCATION_METHODS = ['value', 'quantity'];

const BLANK_FORM: LandedCostForm = {
  grn_id: '', cost_type: 'freight', description: '', amount: '', allocation_method: 'value', notes: '',
};

export default function LandedCostsPage() {
  const { business } = useBusinessContext();
  const [costs, setCosts] = useState<LandedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<LandedCostForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchCosts = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/landed-costs?business_id=${business.id}`);
      const data = await res.json();
      setCosts(data.landed_costs ?? []);
    } catch {
      setCosts([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchCosts(); }, [fetchCosts]);

  const totalCents = costs.reduce((s, c) => s + (c.amount_cents ?? 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id) return;
    setSaving(true);
    try {
      const amount_cents = Math.round(parseFloat(form.amount || '0') * 100);
      await fetch('/api/warehouse/landed-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          grn_id: form.grn_id || null,
          cost_type: form.cost_type,
          description: form.description || null,
          amount_cents,
          allocation_method: form.allocation_method,
          notes: form.notes || null,
        }),
      });
      setForm(BLANK_FORM);
      setShowForm(false);
      fetchCosts();
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl text-sm outline-none text-white';
  const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Landed Costs</h1>
          <p style={{ color: '#6b7280' }}>Capture freight, customs, duties and other inbound costs</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: '#1D9E75' }}
        >
          {showForm ? 'Cancel' : '+ Add Landed Cost'}
        </button>
      </div>

      {/* Summary card */}
      <div className="rounded-xl p-4 mb-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Total landed costs recorded</p>
        <p className="text-2xl font-semibold font-mono text-white">
          A${(totalCents / 100).toFixed(2)}
        </p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{costs.length} entr{costs.length === 1 ? 'y' : 'ies'}</p>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl p-5 mb-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-base font-semibold text-white mb-4">Add Landed Cost</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">GRN ID</label>
              <input
                value={form.grn_id}
                onChange={e => setForm(f => ({ ...f, grn_id: e.target.value }))}
                placeholder="GRN-00001 or leave blank"
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Cost Type</label>
              <select value={form.cost_type} onChange={e => setForm(f => ({ ...f, cost_type: e.target.value }))} className={inputCls} style={inputStyle}>
                {COST_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description"
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Amount (A$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Allocation Method</label>
              <select value={form.allocation_method} onChange={e => setForm(f => ({ ...f, allocation_method: e.target.value }))} className={inputCls} style={inputStyle}>
                {ALLOCATION_METHODS.map(m => <option key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Notes</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving || !form.amount} className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
              {saving ? 'Saving…' : 'Save Landed Cost'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['GRN ID', 'Cost Type', 'Description', 'Amount', 'Allocation', 'Created'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d0d14' }}>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
            ) : costs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No landed costs recorded yet.</td></tr>
            ) : costs.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: '#9ca3af' }}>{c.grn_id ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                    {c.cost_type}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{c.description ?? '—'}</td>
                <td className="px-4 py-3 font-mono font-medium text-white">A${(c.amount_cents / 100).toFixed(2)}</td>
                <td className="px-4 py-3 capitalize" style={{ color: '#9ca3af' }}>{c.allocation_method ?? '—'}</td>
                <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
