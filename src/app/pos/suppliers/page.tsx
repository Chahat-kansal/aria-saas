'use client';
import { useState, useEffect } from 'react';

const C = { bg: 'rgba(17,15,26,0.95)', card: 'rgba(26,23,40,0.9)', border: '#2A2540', text: '#EDE8FF', muted: '#8B85A8', dim: '#4A4565', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444' };
const iStyle: React.CSSProperties = { background: '#0A0910', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', width: '100%', fontFamily: 'inherit' };
const lStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 };

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

  const fld = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  });

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Suppliers</h1>
          <p style={{ fontSize: 12, color: C.muted }}>{suppliers.length} suppliers</p>
        </div>
        <button onClick={openAdd}
          style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add Supplier
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers…"
        style={{ ...iStyle, maxWidth: 280, marginBottom: 14 }} />

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
              {['Supplier', 'Contact', 'Email', 'Phone', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: C.dim, fontSize: 13 }}>Loading…</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: C.dim, fontSize: 13 }}>{!suppliers.length ? 'No suppliers yet' : 'No results'}</td></tr>
            ) : filtered.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{s.contact_name || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{s.email || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{s.phone || '—'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button onClick={() => openEdit(s)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }}>
          <div style={{ background: '#0F0D1C', border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{modal.mode === 'add' ? 'New Supplier' : 'Edit Supplier'}</h2>
              <button onClick={() => setModal({ open: false, mode: 'add' })}
                style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([['name', 'Company Name *'], ['contact_name', 'Contact Name'], ['email', 'Email'], ['phone', 'Phone'], ['address', 'Address'], ['website', 'Website']] as [keyof typeof form, string][]).map(([k, label]) => (
                <div key={k}>
                  <label style={lStyle}>{label}</label>
                  <input {...fld(k)} style={iStyle} />
                </div>
              ))}
              <div>
                <label style={lStyle}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  style={{ ...iStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {modal.mode === 'edit' && (
                  <button onClick={() => modal.sup && del(modal.sup.id)}
                    style={{ fontSize: 12, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Delete
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
