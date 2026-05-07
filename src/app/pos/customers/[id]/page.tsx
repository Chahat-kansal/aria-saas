'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Customer {
  id: string; name: string; email: string | null; phone: string | null;
  loyalty_points: number; total_spent: number; created_at: string;
  address: string | null; notes: string | null;
}

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'transparent', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#8B5CF6', green: '#22C55E' };

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/pos/customers?id=${id}`)
      .then(r => r.json())
      .then(d => {
        const c = d.customer ?? null;
        setCustomer(c);
        if (c) setForm({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', notes: c.notes ?? '' });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function save() {
    if (!customer) return;
    setSaving(true);
    await fetch(`/api/pos/customers?id=${customer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setCustomer(prev => prev ? { ...prev, ...form } : prev);
    setSaving(false);
    setEditing(false);
  }

  if (loading) {
    return (
      <div style={{ padding: 32, background: C.bg, minHeight: '100%', color: C.text, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ padding: 32, background: C.bg, minHeight: '100%', color: C.text }}>
        <Link href="/pos/customers" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← Customers</Link>
        <p style={{ marginTop: 24, color: C.muted }}>Customer not found.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/pos/customers" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← Customers</Link>
          <span style={{ color: C.dim }}>/</span>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{customer.name}</h1>
        </div>
        <button onClick={() => setEditing(e => !e)}
          style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: editing ? 'rgba(139,92,246,0.1)' : 'transparent', color: editing ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {editing ? 'Cancel' : '✏ Edit'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 800 }}>
        {/* Stats */}
        <div style={{ background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 14, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 6 }}>Loyalty Points</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: '#00E5FF' }}>{customer.loyalty_points ?? 0}</p>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 6 }}>Total Spent</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: C.green }}>A${(customer.total_spent ?? 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Details */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginTop: 16, maxWidth: 800 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 16 }}>Contact Details</p>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['name', 'email', 'phone', 'address'] as const).map(field => (
              <div key={field}>
                <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 4, textTransform: 'capitalize' }}>{field}</label>
                <input
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 4 }}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <button onClick={save} disabled={saving}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1, alignSelf: 'flex-start' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              ['Name', customer.name],
              ['Email', customer.email ?? '—'],
              ['Phone', customer.phone ?? '—'],
              ['Address', customer.address ?? '—'],
              ['Member Since', new Date(customer.created_at).toLocaleDateString('en-AU')],
              ['Notes', customer.notes ?? '—'],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 3 }}>{label}</p>
                <p style={{ fontSize: 13, color: C.text }}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
