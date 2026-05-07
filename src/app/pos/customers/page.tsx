'use client';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';
import { useState, useEffect } from 'react';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const iStyle: React.CSSProperties = { background: 'var(--bg-base)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', width: '100%', fontFamily: 'inherit' };
const lStyle: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' };

interface Customer {
  id: string; name: string; email: string | null; phone: string | null;
  loyalty_points: number; created_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch('/api/pos/customers')
      .then(r => r.json())
      .then(d => { setCustomers(d.customers || []); setLoading(false); });
  };
  useEffect(load, []);

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await fetch('/api/pos/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, email: form.email || null, phone: form.phone || null }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.customer) {
      setCustomers(cs => [d.customer, ...cs]);
      setShowAdd(false);
      setForm({ name: '', email: '', phone: '' });
    }
  };

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <POSAriaInsight page="pos/customers" />
      <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Customers</h1>
            <p style={{ fontSize: 12, color: C.muted }}>{customers.length} registered</p>
          </div>
          <button onClick={() => setShowAdd(s => !s)}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Add customer
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addCustomer}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>New customer</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lStyle}>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  style={iStyle} placeholder="Full name" />
              </div>
              <div>
                <label style={lStyle}>Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email"
                  style={iStyle} placeholder="Optional" />
              </div>
              <div>
                <label style={lStyle}>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  style={iStyle} placeholder="Optional" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Add customer'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div style={{ marginBottom: 14 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone…"
            style={{ ...iStyle, maxWidth: 320 }} />
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Customer', 'Email', 'Phone', 'Loyalty pts', 'Since'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 14px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '48px 14px', fontSize: 13, color: C.dim }}>Loading…</td></tr>
              ) : !filtered.length ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '48px 14px', fontSize: 13, color: C.dim }}>
                  {!customers.length ? 'No customers yet' : 'No customers match'}
                </td></tr>
              ) : (
                filtered.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.violet, flexShrink: 0 }}>
                          {c.name[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{c.email || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{c.phone || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.loyalty_points > 0 ? C.violet : C.dim }}>
                        {c.loyalty_points}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: C.dim }}>
                      {new Date(c.created_at).toLocaleDateString('en-AU')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
