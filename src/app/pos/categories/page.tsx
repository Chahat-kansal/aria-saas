'use client';
import { useState, useEffect } from 'react';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444' };
const iStyle: React.CSSProperties = { background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', width: '100%', fontFamily: 'inherit' };
const lStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 };

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
      if (!res.ok || d.error) {
        alert(d.error ?? 'Failed to create category. Please try again.');
        setSaving(false);
        return;
      }
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
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Categories</h1>
          <p style={{ fontSize: 12, color: C.muted }}>{categories.length} categories</p>
        </div>
        <button onClick={openAdd}
          style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add Category
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 96, borderRadius: 14, background: 'rgba(255,255,255,0.04)', animation: 'pos-processing 1s ease infinite' }} />
          ))}
        </div>
      ) : !categories.length ? (
        <div style={{ textAlign: 'center', paddingTop: 80 }}>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>No categories yet</p>
          <button onClick={openAdd} style={{ fontSize: 13, color: C.violet, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Create your first category
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => openEdit(cat)}
              style={{ position: 'relative', padding: '16px', borderRadius: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${cat.color}35`, background: `${cat.color}12`, opacity: !cat.is_active ? 0.5 : 1 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <FolderIcon white />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{cat.name}</p>
              {cat.description && (
                <p style={{ fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.description}</p>
              )}
              {!cat.is_active && (
                <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, background: 'rgba(0,0,0,0.4)', color: C.dim, padding: '2px 6px', borderRadius: 99 }}>Inactive</span>
              )}
            </button>
          ))}
        </div>
      )}

      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }}>
          <div style={{ background: '#0F0D1C', border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 440 }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                {modal.mode === 'add' ? 'New Category' : 'Edit Category'}
              </h2>
              <button onClick={() => setModal({ open: false, mode: 'add' })}
                style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lStyle}>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Beverages" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional…" style={iStyle} />
              </div>
              <div>
                <label style={lStyle}>Colour</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {PALETTE.map(col => (
                    <button key={col} onClick={() => setForm(f => ({ ...f, color: col }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: col, border: form.color === col ? `3px solid #fff` : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                  ))}
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: 28, height: 28, borderRadius: '50%', padding: 2, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'transparent' }} />
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, background: `${form.color}12`, border: `1.5px solid ${form.color}35` }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: form.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FolderIcon white />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{form.name || 'Preview'}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lStyle}>Sort Order</label>
                  <input value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                    type="number" min="0" placeholder="0" style={iStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.is_active}
                      onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                      style={{ accentColor: C.violet, width: 14, height: 14 }} />
                    <span style={{ fontSize: 13, color: C.text }}>Active</span>
                  </label>
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {modal.mode === 'edit' && (
                  <button onClick={() => modal.cat && del(modal.cat.id)} disabled={!!deleting}
                    style={{ fontSize: 12, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: deleting ? 0.5 : 1 }}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModal({ open: false, mode: 'add' })}
                  style={{ padding: '8px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={save} disabled={saving || !form.name.trim()}
                  style={{ padding: '8px 22px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !form.name.trim() ? 0.5 : 1 }}>
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
    <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14, color: white ? '#fff' : C.violet }}>
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
    </svg>
  );
}
