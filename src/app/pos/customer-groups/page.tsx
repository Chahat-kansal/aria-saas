'use client';
import { useState, useEffect, useCallback } from 'react';

interface Group { id: string; name: string; description: string | null; discount_percent: number | null; customer_count: number; }

export default function CustomerGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', discount_percent: '' });

  const load = useCallback(() => {
    fetch('/api/pos/customer-groups').then(r => r.json()).then(d => { setGroups(d.groups ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.name) return;
    setSaving(true);
    const body = { name: form.name, description: form.description || null, discount_percent: form.discount_percent ? parseFloat(form.discount_percent) : null };
    if (editId) {
      await fetch(`/api/pos/customer-groups?id=${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch('/api/pos/customer-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    setSaving(false); setShowAdd(false); setEditId(null);
    setForm({ name: '', description: '', discount_percent: '' });
    load();
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this customer group?')) return;
    await fetch(`/api/pos/customer-groups?id=${id}`, { method: 'DELETE' });
    load();
  }

  function startEdit(g: Group) {
    setEditId(g.id);
    setForm({ name: g.name, description: g.description ?? '', discount_percent: g.discount_percent ? String(g.discount_percent) : '' });
    setShowAdd(true);
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] outline-none';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div><h1 className="text-xl font-semibold text-[#1a1a16]">Customer Groups</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Segment customers and apply group discounts</p></div>
        <button onClick={() => { setShowAdd(true); setEditId(null); setForm({ name: '', description: '', discount_percent: '' }); }} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--violet)' }}>+ New Group</button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-12 text-center shadow-sm">
          <p className="text-sm font-medium text-[#1a1a16] mb-1">No customer groups</p>
          <p className="text-xs text-[rgba(26,26,22,.4)] mb-4">Create groups to segment customers and apply automatic discounts.</p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--violet)' }}>Create first group</button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] px-5 py-4 shadow-sm flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#1a1a16]">{g.name}</p>
                {g.description && <p className="text-xs text-[rgba(26,26,22,.4)] mt-0.5">{g.description}</p>}
              </div>
              {g.discount_percent ? (
                <span className="text-sm font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700">{g.discount_percent}% off</span>
              ) : (
                <span className="text-xs text-[rgba(26,26,22,.3)]">No discount</span>
              )}
              <span className="text-xs text-[rgba(26,26,22,.35)]">{g.customer_count} customers</span>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(g)} className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.5)] hover:border-[rgba(0,0,0,.2)]">Edit</button>
                <button onClick={() => deleteGroup(g.id)} className="text-xs px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[rgba(0,0,0,.08)]">
            <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-[#1a1a16]">{editId ? 'Edit Group' : 'New Group'}</h3><button onClick={() => { setShowAdd(false); setEditId(null); }} className="text-gray-400">×</button></div>
            <div className="space-y-3">
              <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Wholesale Customers" /></div>
              <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Description</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={inputCls} placeholder="Optional description" /></div>
              <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Auto-discount % (applied at POS)</label><input type="number" min={0} max={100} value={form.discount_percent} onChange={e => setForm(p => ({ ...p, discount_percent: e.target.value }))} className={inputCls} placeholder="e.g. 10" /></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowAdd(false); setEditId(null); }} className="flex-1 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] text-[rgba(26,26,22,.5)]">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--violet)' }}>{saving ? 'Saving…' : (editId ? 'Save' : 'Create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
