'use client';
import { useState, useEffect } from 'react';

interface SaleKey {
  id: string; label: string; type: string; value: string | null; color: string;
  text_color: string; position: number; is_active: boolean;
}

const KEY_TYPES = ['product', 'category', 'discount', 'open_price', 'note', 'custom'];
const COLOR_PRESETS = ['#2563eb','#7c3aed','#db2777','#dc2626','#ea580c','#d97706','#16a34a','#0891b2','#475569','#1a1a16'];
const EMPTY = { label: '', type: 'product', value: '', color: '#2563eb', text_color: '#ffffff', position: '', is_active: true };

export default function SaleKeysPage() {
  const [keys, setKeys] = useState<SaleKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; key?: SaleKey }>({ open: false, mode: 'add' });
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { setKeys(d.sale_keys ?? []); setLoading(false); });
  }, []);

  function openAdd() { setForm({ ...EMPTY, position: String(keys.length + 1) }); setModal({ open: true, mode: 'add' }); }
  function openEdit(k: SaleKey) {
    setForm({ label: k.label, type: k.type, value: k.value ?? '', color: k.color, text_color: k.text_color, position: String(k.position), is_active: k.is_active });
    setModal({ open: true, mode: 'edit', key: k });
  }

  async function save() {
    if (!form.label.trim()) return;
    setSaving(true);
    const payload = { label: form.label, type: form.type, value: form.value || null, color: form.color, text_color: form.text_color, position: parseInt(form.position) || 0, is_active: form.is_active };
    if (modal.mode === 'add') {
      const res = await fetch('/api/pos/sale-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.sale_key) setKeys(ks => [...ks, d.sale_key].sort((a, b) => a.position - b.position));
    } else if (modal.key) {
      await fetch(`/api/pos/sale-keys?id=${modal.key.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setKeys(ks => ks.map(k => k.id === modal.key!.id ? { ...k, ...payload } : k).sort((a, b) => a.position - b.position));
    }
    setSaving(false); setModal({ open: false, mode: 'add' });
  }

  async function del(id: string) {
    await fetch(`/api/pos/sale-keys?id=${id}`, { method: 'DELETE' });
    setKeys(ks => ks.filter(k => k.id !== id));
    setModal({ open: false, mode: 'add' });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Sale Keys</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Configure quick-access keys on the register</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
          + Add Key
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {[...Array(8)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-[rgba(0,0,0,.06)] animate-pulse" />)}
        </div>
      ) : !keys.length ? (
        <div className="text-center py-20 text-sm text-[rgba(26,26,22,.4)]">No sale keys yet — add one above</div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {keys.map(k => (
            <button key={k.id} onClick={() => openEdit(k)}
              className={`h-16 rounded-xl flex flex-col items-center justify-center text-center px-1 transition-all hover:scale-105 active:scale-100 ${!k.is_active ? 'opacity-40' : ''}`}
              style={{ background: k.color, color: k.text_color }}>
              <span className="text-[11px] font-semibold leading-tight">{k.label}</span>
              <span className="text-[9px] opacity-70 mt-0.5">{k.type}</span>
            </button>
          ))}
        </div>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a16]">{modal.mode === 'add' ? 'New Sale Key' : 'Edit Sale Key'}</h2>
              <button onClick={() => setModal({ open: false, mode: 'add' })} className="text-[rgba(26,26,22,.4)] text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Label *</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Coffee"
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]">
                    {KEY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Position</label>
                  <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} type="number" min="1"
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Value (product ID, discount %…)</label>
                <input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="Optional"
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-2">Background Colour</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-[#2563eb] scale-110' : ''}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    className="w-7 h-7 rounded-full border border-[rgba(0,0,0,.1)] p-0.5 cursor-pointer" />
                </div>
              </div>
              <div className="p-3 rounded-xl flex items-center justify-center h-16" style={{ background: form.color }}>
                <span className="text-xs font-semibold" style={{ color: form.text_color }}>{form.label || 'Preview'}</span>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded accent-[#2563eb]" />
                <span className="text-xs font-medium text-[rgba(26,26,22,.7)]">Active</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <div>{modal.mode === 'edit' && <button onClick={() => modal.key && del(modal.key.id)} className="text-xs text-red-500 hover:text-red-600">Delete</button>}</div>
              <div className="flex gap-2">
                <button onClick={() => setModal({ open: false, mode: 'add' })} className="px-4 py-2 rounded-lg text-sm font-medium text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)] hover:bg-[rgba(0,0,0,.04)]">Cancel</button>
                <button onClick={save} disabled={saving || !form.label.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                  {saving ? 'Saving…' : modal.mode === 'add' ? 'Create' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}