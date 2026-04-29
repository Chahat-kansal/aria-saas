'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { AriaIntelligencePanel } from '@/components/dashboard/AriaIntelligencePanel';

interface Supplier { name: string; id?: string; total_orders: number; on_time_pct: number | null; fill_rate_pct: number | null; discrepancies: number; avg_lead_days: number | null; last_order: string; }
interface Insight { supplier: string; insight: string; rating: string; }

const BLANK_FORM = { name: '', contact_name: '', email: '', phone: '', payment_terms: 'net30', lead_time_days: '7', minimum_order_cents: '' };

function ScoreBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs" style={{ color: '#4b5563' }}>N/A</span>;
  const color = value >= 90 ? '#1D9E75' : value >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
      <span className="text-xs w-8 text-right" style={{ color }}>{value}%</span>
    </div>
  );
}

export default function SuppliersPage() {
  const { business } = useBusinessContext();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/warehouse/suppliers?business_id=${business.id}`).then(r => r.json()).catch(() => ({ suppliers: [] }));
    setSuppliers(res.suppliers ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function getInsights() {
    if (!business?.id || !suppliers.length) return;
    setLoadingInsights(true);
    const res = await fetch('/api/aria/supplier-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, suppliers }),
    }).then(r => r.json()).catch(() => ({ insights: [] }));
    setInsights(res.insights ?? []);
    setLoadingInsights(false);
  }

  async function saveSupplier() {
    if (!business?.id || !form.name.trim()) return;
    setSaving(true);
    const payload = {
      business_id: business.id,
      name: form.name,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      payment_terms: form.payment_terms || 'net30',
      lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : null,
      minimum_order_cents: form.minimum_order_cents ? Math.round(parseFloat(form.minimum_order_cents) * 100) : null,
    };
    if (editingId) {
      await fetch(`/api/warehouse/suppliers/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/warehouse/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    setShowAdd(false);
    setEditingId(null);
    setForm({ ...BLANK_FORM });
    load();
  }

  const insightMap: Record<string, Insight> = {};
  for (const ins of insights) insightMap[ins.supplier] = ins;

  const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] focus:border-[rgba(29,158,117,0.4)]';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Supplier Performance</h1>
          <p style={{ color: '#6b7280' }}>Track on-time delivery, fill rates, and discrepancies per supplier.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={getInsights} disabled={loadingInsights || !suppliers.length}
            className="px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-40 flex items-center gap-1"
            style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
            {loadingInsights ? <><span className="inline-block w-2.5 h-2.5 border border-[#1D9E75] border-t-transparent rounded-full animate-spin" />Analysing…</> : '✦ Aria Insights'}
          </button>
          <button onClick={() => { setShowAdd(true); setEditingId(null); setForm({ ...BLANK_FORM }); }}
            className="px-3 py-2 rounded-xl text-xs font-medium text-white"
            style={{ background: '#1D9E75' }}>
            + Add supplier
          </button>
        </div>
      </div>

      <AriaIntelligencePanel mode="supplier" />

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: '#13131a' }} />)}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-3xl mb-3">🏭</div>
          <p className="font-semibold text-white mb-1">No suppliers yet</p>
          <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Add suppliers and receive GRNs to track performance automatically.</p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>Add your first supplier</button>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => {
            const ins = insightMap[s.name];
            return (
              <div key={s.name} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-white font-medium">{s.name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                      {s.total_orders} GRN{s.total_orders !== 1 ? 's' : ''} · Last: {s.last_order}
                      {s.avg_lead_days !== null ? ` · Avg lead: ${s.avg_lead_days}d` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ins && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ins.rating === 'good' ? 'bg-green-900/30 text-green-400' : ins.rating === 'fair' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'}`}>
                        {ins.rating}
                      </span>
                    )}
                    {s.id && (
                      <button onClick={() => { setEditingId(s.id!); setForm({ name: s.name, contact_name: '', email: '', phone: '', payment_terms: 'net30', lead_time_days: String(s.avg_lead_days ?? 7), minimum_order_cents: '' }); setShowAdd(true); }}
                        className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs mb-2" style={{ color: '#6b7280' }}>On-time delivery</p>
                    <ScoreBar value={s.on_time_pct} />
                  </div>
                  <div>
                    <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Fill rate</p>
                    <ScoreBar value={s.fill_rate_pct} />
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Discrepancies</p>
                    <p className="text-sm font-medium" style={{ color: s.discrepancies > 0 ? '#ef4444' : '#1D9E75' }}>
                      {s.discrepancies === 0 ? 'None' : `${s.discrepancies} found`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Total orders</p>
                    <p className="text-sm font-medium text-white">{s.total_orders}</p>
                  </div>
                </div>
                {ins && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                      <span style={{ color: '#1D9E75' }}>✦ Aria: </span>{ins.insight}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit supplier modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-md border border-[rgba(255,255,255,0.1)]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">{editingId ? 'Edit supplier' : 'Add supplier'}</h3>
              <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="text-gray-400 hover:text-white text-lg">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Supplier name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. ALM Australia" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Contact name</label>
                  <input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} className={inputCls} placeholder="John Smith" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Phone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="03 9xxx xxxx" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="orders@supplier.com.au" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Payment terms</label>
                  <select value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} className={inputCls}>
                    {['net7', 'net14', 'net30', 'net60', 'cod', 'prepaid'].map(t => <option key={t} value={t} style={{ background: '#1a1a2e' }}>{t.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Avg lead time (days)</label>
                  <input type="number" min={0} value={form.lead_time_days} onChange={e => setForm(p => ({ ...p, lead_time_days: e.target.value }))} className={inputCls} placeholder="7" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Minimum order (A$)</label>
                <input type="number" min={0} step={0.01} value={form.minimum_order_cents} onChange={e => setForm(p => ({ ...p, minimum_order_cents: e.target.value }))} className={inputCls} placeholder="0.00" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={saveSupplier} disabled={saving || !form.name.trim()} className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
