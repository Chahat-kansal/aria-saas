'use client';
import { useState, useEffect, useCallback } from 'react';

interface Item { id: string; name: string; created_at?: string; }

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#006AFF' };
type TabType = 'brand' | 'family' | 'tag';

const TABS: { key: TabType; label: string; emoji: string }[] = [
  { key: 'brand',  label: 'Brands',   emoji: '🏷' },
  { key: 'family', label: 'Families', emoji: '📂' },
  { key: 'tag',    label: 'Tags',     emoji: '🔖' },
];

export default function ClassificationsPage() {
  const [tab, setTab]     = useState<TabType>('brand');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding]   = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pos/classifications?type=${tab}`);
      const d = await r.json();
      setItems(d.items ?? []);
    } catch { setItems([]); }
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const r = await fetch('/api/pos/classifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tab, name: newName.trim() }),
      });
      const d = await r.json();
      if (d.item) { setItems(prev => [...prev, d.item].sort((a, b) => a.name.localeCompare(b.name))); setNewName(''); }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function save(id: string) {
    if (!editName.trim()) return;
    await fetch('/api/pos/classifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tab, id, name: editName.trim() }),
    });
    setItems(prev => prev.map(i => i.id === id ? { ...i, name: editName.trim() } : i));
    setEditId(null);
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/pos/classifications?type=${tab}&id=${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ padding: '24px 24px 32px', maxWidth: 720 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>Classifications</h1>
          <p style={{ fontSize: 12, color: C.muted }}>Manage brands, families, and tags for your products</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#FAFAFA', borderRadius: 12, padding: 4, width: 'fit-content' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '6px 16px', borderRadius: 9, border: 'none', background: tab === t.key ? C.violet : 'transparent', color: tab === t.key ? '#fff' : C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms', display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Add new */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder={`New ${tab} name…`}
            style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={add} disabled={adding || !newName.trim()}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: !newName.trim() ? 0.4 : 1 }}>
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </div>

        {/* List */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div>
          ) : !items.length ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{TABS.find(t => t.key === tab)?.emoji}</div>
              <p style={{ color: C.muted, fontSize: 14 }}>No {tab}s yet</p>
              <p style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>Add your first {tab} using the form above</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 16px' }}>Name</th>
                  <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 16px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      {editId === item.id ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input value={editName} onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') save(item.id); if (e.key === 'Escape') setEditId(null); }}
                            autoFocus
                            style={{ flex: 1, background: C.bg, border: `1px solid ${C.violet}`, color: C.text, borderRadius: 6, padding: '5px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                          <button onClick={() => save(item.id)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: C.violet, color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                          <button onClick={() => setEditId(null)} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{item.name}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setEditId(item.id); setEditName(item.name); }}
                          style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                        <button onClick={() => del(item.id, item.name)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)', color: '#EF4444', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ fontSize: 11, color: C.dim, marginTop: 12 }}>
          Note: Run the database migration (<code style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>20260505000001_pos_advanced.sql</code>) in Supabase to enable this feature.
        </p>
      </div>
    </div>
  );
}
