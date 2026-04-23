'use client';
import { useState, useEffect } from 'react';

interface Outlet { id: string; name: string; address: string | null; phone: string | null; email: string | null; is_active: boolean; }
const EMPTY = { name: '', address: '', phone: '', email: '', is_active: true };

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; outlet?: Outlet }>({ open: false, mode: 'add' });
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/pos/outlets').then(r => r.json()).then(d => { setOutlets(d.outlets ?? []); setLoading(false); });
  }, []);

  function openAdd() { setForm({ ...EMPTY }); setModal({ open: true, mode: 'add' }); }
  function openEdit(o: Outlet) {
    setForm({ name: o.name, address: o.address ?? '', phone: o.phone ?? '', email: o.email ?? '', is_active: o.is_active });
    setModal({ open: true, mode: 'edit', outlet: o });
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name, address: form.address || null, phone: form.phone || null, email: form.email || null, is_active: form.is_active };
    if (modal.mode === 'add') {
      const res = await fetch('/api/pos/outlets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.outlet) setOutlets(os => [...os, d.outlet]);
    } else if (modal.outlet) {
      await fetch(`/api/pos/outlets?id=${modal.outlet.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setOutlets(os => os.map(o => o.id === modal.outlet!.id ? { ...o, ...payload } : o));
    }
    setSaving(false); setModal({ open: false, mode: 'add' });
  }

  async function del(id: string) {
    await fetch(`/api/pos/outlets?id=${id}`, { method: 'DELETE' });
    setOutlets(os => os.filter(o => o.id !== id));
    setModal({ open: false, mode: 'add' });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Registers &amp; Outlets</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{outlets.length} outlets</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
          + Add Outlet
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? [...Array(2)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-[rgba(0,0,0,.05)] animate-pulse" />) :
        !outlets.length ? (
          <div className="col-span-3 text-center py-20 text-sm text-[rgba(26,26,22,.4)]">No outlets yet</div>
        ) : outlets.map(o => (
          <div key={o.id} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="w-8 h-8 rounded-lg bg-[rgba(37,99,235,.1)] flex items-center justify-center">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#2563eb]"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${o.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[rgba(0,0,0,.05)] text-[rgba(26,26,22,.4)] border border-[rgba(0,0,0,.08)]'}`}>
                {o.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-[#1a1a16]">{o.name}</p>
            {o.address && <p className="text-[11px] text-[rgba(26,26,22,.45)] mt-0.5">{o.address}</p>}
            {o.phone && <p className="text-[11px] text-[rgba(26,26,22,.45)]">{o.phone}</p>}
            <button onClick={() => openEdit(o)} className="mt-3 text-xs text-[#2563eb] hover:underline font-medium">Edit</button>
          </div>
        ))}
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a16]">{modal.mode === 'add' ? 'New Outlet' : 'Edit Outlet'}</h2>
              <button onClick={() => setModal({ open: false, mode: 'add' })} className="text-[rgba(26,26,22,.4)] text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {([['name', 'Outlet Name *'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email']] as [keyof typeof form, string][]).map(([k, label]) => (
                <div key={String(k)}>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">{label}</label>
                  <input value={form[k] as string} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                </div>
              ))}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded accent-[#2563eb]" />
                <span className="text-xs font-medium text-[rgba(26,26,22,.7)]">Active</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <div>{modal.mode === 'edit' && <button onClick={() => modal.outlet && del(modal.outlet.id)} className="text-xs text-red-500 hover:text-red-600">Delete</button>}</div>
              <div className="flex gap-2">
                <button onClick={() => setModal({ open: false, mode: 'add' })} className="px-4 py-2 rounded-lg text-sm font-medium text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)] hover:bg-[rgba(0,0,0,.04)]">Cancel</button>
                <button onClick={save} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
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