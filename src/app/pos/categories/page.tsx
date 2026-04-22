'use client';
import { useState, useEffect } from 'react';

interface Category {
  id: string; name: string; description: string | null; color: string;
  sort_order: number | null; is_active: boolean;
}

const PALETTE = [
  '#2563eb','#7c3aed','#db2777','#dc2626','#ea580c',
  '#d97706','#16a34a','#0891b2','#475569','#1a1a16',
];

const EMPTY = { name: '', description: '', color: PALETTE[0], sort_order: '', is_active: true };

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; cat?: Category }>({ open: false, mode: 'add' });
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/pos/products');
    const d = await res.json();
    setCategories(d.categories || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm({ ...EMPTY });
    setModal({ open: true, mode: 'add' });
  }
  function openEdit(c: Category) {
    setForm({ name: c.name, description: c.description ?? '', color: c.color, sort_order: c.sort_order != null ? String(c.sort_order) : '', is_active: c.is_active });
    setModal({ open: true, mode: 'edit', cat: c });
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(), description: form.description || null,
      color: form.color, sort_order: form.sort_order ? parseInt(form.sort_order) : null,
      is_active: form.is_active,
    };
    if (modal.mode === 'add') {
      const res = await fetch('/api/pos/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.category) setCategories(cs => [...cs, d.category]);
    } else if (modal.cat) {
      await fetch(`/api/pos/categories?id=${modal.cat.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setCategories(cs => cs.map(c => c.id === modal.cat!.id ? { ...c, ...payload } : c));
    }
    setSaving(false);
    setModal({ open: false, mode: 'add' });
  }

  async function del(id: string) {
    setDeleting(id);
    await fetch(`/api/pos/categories?id=${id}`, { method: 'DELETE' });
    setCategories(cs => cs.filter(c => c.id !== id));
    setDeleting(null);
    if (modal.open) setModal({ open: false, mode: 'add' });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Categories</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{categories.length} categories</p>
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
          + Add Category
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-[rgba(0,0,0,.05)] animate-pulse" />
          ))}
        </div>
      ) : !categories.length ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(37,99,235,.1)' }}>
            <FolderIcon />
          </div>
          <p className="text-sm text-[rgba(26,26,22,.4)] mb-4">No categories yet</p>
          <button onClick={openAdd} className="text-sm text-[#2563eb] hover:underline">Create your first category</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {categories.map(c => (
            <button key={c.id} onClick={() => openEdit(c)}
              className={`relative p-4 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-100 ${!c.is_active ? 'opacity-50' : ''}`}
              style={{ background: `${c.color}18`, border: `1.5px solid ${c.color}35` }}>
              <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ background: c.color }}>
                <FolderIcon white />
              </div>
              <p className="text-[13px] font-semibold text-[#1a1a16] leading-tight">{c.name}</p>
              {c.description && (
                <p className="text-[10px] text-[rgba(26,26,22,.45)] mt-0.5 line-clamp-1">{c.description}</p>
              )}
              {!c.is_active && (
                <span className="absolute top-2 right-2 text-[9px] bg-[rgba(0,0,0,.08)] text-[rgba(26,26,22,.4)] px-1.5 py-0.5 rounded-full">Inactive</span>
              )}
            </button>
          ))}
        </div>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a16]">
                {modal.mode === 'add' ? 'New Category' : 'Edit Category'}
              </h2>
              <button onClick={() => setModal({ open: false, mode: 'add' })}
                className="text-[rgba(26,26,22,.4)] hover:text-[#1a1a16] text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Beverages"
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional…"
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-2">Colour</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PALETTE.map(col => (
                    <button key={col} onClick={() => setForm(f => ({ ...f, color: col }))}
                      className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${form.color === col ? 'ring-2 ring-offset-2 ring-[#2563eb] scale-110' : ''}`}
                      style={{ background: col }} />
                  ))}
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    className="w-7 h-7 rounded-full border border-[rgba(0,0,0,.1)] cursor-pointer p-0.5" title="Custom colour" />
                </div>
                <div className="mt-3 p-3 rounded-xl flex items-center gap-2" style={{ background: `${form.color}18`, border: `1.5px solid ${form.color}35` }}>
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: form.color }}>
                    <FolderIcon white />
                  </div>
                  <span className="text-xs font-medium text-[#1a1a16]">{form.name || 'Preview'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Sort Order</label>
                  <input value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                    type="number" min="0" placeholder="0"
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                      className="rounded border-[rgba(0,0,0,.2)] accent-[#2563eb]" />
                    <span className="text-xs font-medium text-[rgba(26,26,22,.7)]">Active</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <div>
                {modal.mode === 'edit' && (
                  <button onClick={() => modal.cat && del(modal.cat.id)} disabled={!!deleting}
                    className="text-xs text-red-500 hover:text-red-600 transition-colors disabled:opacity-50">
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModal({ open: false, mode: 'add' })}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)] hover:bg-[rgba(0,0,0,.04)] transition-colors">
                  Cancel
                </button>
                <button onClick={save} disabled={saving || !form.name.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
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

function FolderIcon({ white }: { white?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 ${white ? 'text-white' : 'text-[#2563eb]'}`}>
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
    </svg>
  );
}