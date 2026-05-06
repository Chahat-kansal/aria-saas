'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444' };

interface Template { id: string; name: string; type: string; for_type: string; is_default?: boolean; }

export default function ReceiptsPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pos/receipt-templates').then(r => r.json()).then(d => {
      setTemplates(d.templates || []); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function createNew() {
    const res = await fetch('/api/pos/receipt-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Receipt', type: 'normal', for_type: 'sale' }),
    });
    const d = await res.json();
    if (d.template?.id) router.push(`/pos/settings/receipts/${d.template.id}`);
  }

  async function deleteTemplate(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`/api/pos/receipt-templates?id=${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  async function setDefault(id: string) {
    await fetch('/api/pos/receipt-templates', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_default: true }),
    });
    setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === id })));
  }

  async function cloneTemplate(t: Template) {
    const res = await fetch('/api/pos/receipt-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${t.name} (Copy)`, type: t.type, for_type: t.for_type }),
    });
    const d = await res.json();
    if (d.template) setTemplates(prev => [...prev, d.template]);
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Receipt Templates</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={createNew} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + New Template
        </button>
      </div>

      {loading ? (
        <p style={{ color: C.muted }}>Loading...</p>
      ) : !templates.length ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🧾</p>
          <p style={{ color: C.muted, fontSize: 14 }}>No receipt templates yet</p>
          <button onClick={createNew} style={{ marginTop: 16, padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Create first template</button>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                {['Name','Type','For','Actions'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Actions' ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 16px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: i < templates.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.text }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {t.name}
                      {t.is_default && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.15)', color: C.green, fontWeight: 700 }}>✓ Default</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{t.type}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{t.for_type}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {!t.is_default && <button onClick={() => setDefault(t.id)} style={{ fontSize: 12, color: C.green, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Set default</button>}
                      <Link href={`/pos/settings/receipts/${t.id}`} style={{ fontSize: 12, color: C.violet, textDecoration: 'none', fontWeight: 600 }}>Edit</Link>
                      <button onClick={() => cloneTemplate(t)} style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clone</button>
                      <button onClick={() => deleteTemplate(t.id, t.name)} style={{ fontSize: 12, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
