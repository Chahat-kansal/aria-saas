'use client';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';
import { useState, useEffect, useCallback } from 'react';

interface Promo { id: string; name: string; type: string; discount_value: number; start_date: string | null; end_date: string | null; is_active: boolean; usage_count: number; }

const TYPE_LABELS: Record<string, string> = { percentage: '% Off', fixed: 'A$ Off', bxgy: 'Buy X Get Y', free_item: 'Free Item' };

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'percentage', discount_value: '', start_date: '', end_date: '', is_active: true });

  const load = useCallback(() => {
    fetch('/api/pos/promotions').then(r => r.json()).then(d => { setPromos(d.promotions ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.name) return;
    setSaving(true);
    await fetch('/api/pos/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, discount_value: parseFloat(form.discount_value) || 0, start_date: form.start_date || null, end_date: form.end_date || null }) });
    setSaving(false); setShowAdd(false);
    setForm({ name: '', type: 'percentage', discount_value: '', start_date: '', end_date: '', is_active: true });
    load();
  }

  async function toggle(id: string, cur: boolean) {
    await fetch(`/api/pos/promotions?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !cur }) });
    load();
  }

  const now = new Date();
  const activeCount = promos.filter(p => p.is_active).length;
  const liveCount = promos.filter(p => p.is_active && (!p.start_date || new Date(p.start_date) <= now) && (!p.end_date || new Date(p.end_date) >= now)).length;

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
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#8B5CF6' }}>+ New Promotion</button>
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
          <thead><tr className="border-b border-[rgba(0,0,0,.06)]">{['Name','Type','Discount','Start','End','Uses','Status'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[rgba(26,26,22,.4)]">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.35)]">Loading…</td></tr>
            : promos.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center"><p className="text-sm font-medium text-[#1a1a16] mb-1">No promotions yet</p><p className="text-xs text-[rgba(26,26,22,.4)]">Create your first promotion to offer discounts at checkout.</p></td></tr>
            : promos.map(p => (
              <tr key={p.id} className="border-b border-[rgba(0,0,0,.04)] hover:bg-[rgba(0,0,0,.015)]">
                <td className="px-4 py-3 font-medium text-[#1a1a16]">{p.name}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.5)]">{TYPE_LABELS[p.type] ?? p.type}</td>
                <td className="px-4 py-3 font-semibold">{p.type === 'percentage' ? `${p.discount_value}%` : `A$${p.discount_value}`}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{p.start_date ? new Date(p.start_date).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{p.end_date ? new Date(p.end_date).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{p.usage_count ?? 0}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(p.id, p.is_active)} className={`text-xs px-3 py-1 rounded-full font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.is_active ? 'Active' : 'Inactive'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[rgba(0,0,0,.08)]">
            <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-[#1a1a16]">New Promotion</h3><button onClick={() => setShowAdd(false)} className="text-gray-400">×</button></div>
            <div className="space-y-3">
              <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Summer Sale 10% Off" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Type</label><select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className={inputCls + ' bg-white'}>{Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Value</label><input type="number" min={0} value={form.discount_value} onChange={e => setForm(p => ({ ...p, discount_value: e.target.value }))} className={inputCls} placeholder={form.type === 'percentage' ? '10' : '5.00'} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Start</label><input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className={inputCls} /></div>
                <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">End</label><input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className={inputCls} /></div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 accent-[#8B5CF6]" /><span className="text-sm text-[#1a1a16]">Active immediately</span></label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] text-[rgba(26,26,22,.5)]">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#8B5CF6' }}>{saving ? 'Saving…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
