'use client';
import { useState, useEffect } from 'react';

interface Supplier {
  id: string; name: string; contact_name: string | null; email: string | null;
  phone: string | null; address: string | null; website: string | null; notes: string | null;
}

const EMPTY = { name: '', contact_name: '', email: '', phone: '', address: '', website: '', notes: '' };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; sup?: Supplier }>({ open: false, mode: 'add' });
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/pos/suppliers').then(r => r.json()).then(d => { setSuppliers(d.suppliers ?? []); setLoading(false); });
  }, []);

  const filtered = suppliers.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.email ?? '').toLowerCase().includes(search.toLowerCase()));

  function openAdd() { setForm({ ...EMPTY }); setModal({ open: true, mode: 'add' }); }
  function openEdit(s: Supplier) {
    setForm({ name: s.name, contact_name: s.contact_name ?? '', email: s.email ?? '', phone: s.phone ?? '', address: s.address ?? '', website: s.website ?? '', notes: s.notes ?? '' });
    setModal({ open: true, mode: 'edit', sup: s });
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name, contact_name: form.contact_name || null, email: form.email || null, phone: form.phone || null, address: form.address || null, website: form.website || null, notes: form.notes || null };
    if (modal.mode === 'add') {
      const res = await fetch('/api/pos/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.supplier) setSuppliers(ss => [...ss, d.supplier]);
    } else if (modal.sup) {
      await fetch(`/api/pos/suppliers?id=${modal.sup.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setSuppliers(ss => ss.map(s => s.id === modal.sup!.id ? { ...s, ...payload } : s));
    }
    setSaving(false); setModal({ open: false, mode: 'add' });
  }

  async function del(id: string) {
    await fetch(`/api/pos/suppliers?id=${id}`, { method: 'DELETE' });
    setSuppliers(ss => ss.filter(s => s.id !== id));
    setModal({ open: false, mode: 'add' });
  }

  const fld = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value })) });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Suppliers</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{suppliers.length} suppliers</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
          + Add Supplier
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers…"
        className="mb-4 bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-xs text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb] w-64" />

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
              {['Supplier', 'Contact', 'Email', 'Phone', ''].map(h => (
                <th key={h} className="text-left text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-xs text-[rgba(26,26,22,.3)]">Loading…</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={5} className="text-center py-16 text-xs text-[rgba(26,26,22,.3)]">{!suppliers.length ? 'No suppliers yet' : 'No results'}</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="border-b border-[rgba(0,0,0,.04)] last:border-0 hover:bg-[rgba(37,99,235,.02)] transition-colors">
                <td className="px-4 py-3 text-[13px] font-medium text-[#1a1a16]">{s.name}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">{s.contact_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">{s.email || '—'}</td>
                <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.55)]">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(s)} className="text-[10px] text-[rgba(26,26,22,.4)] hover:text-[#2563eb] transition-colors font-medium">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a16]">{modal.mode === 'add' ? 'New Supplier' : 'Edit Supplier'}</h2>
              <button onClick={() => setModal({ open: false, mode: 'add' })} className="text-[rgba(26,26,22,.4)] hover:text-[#1a1a16] text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {([['name', 'Company Name *'], ['contact_name', 'Contact Name'], ['email', 'Email'], ['phone', 'Phone'], ['address', 'Address'], ['website', 'Website']] as [keyof typeof form, string][]).map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">{label}</label>
                  <input {...fld(k)} className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb] resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <div>{modal.mode === 'edit' && <button onClick={() => modal.sup && del(modal.sup.id)} className="text-xs text-red-500 hover:text-red-600">Delete</button>}</div>
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