'use client';
import { useState, useEffect, useCallback } from 'react';

interface Modifier {
  id: string;
  name: string;
  price_adjustment: number;
  modifier_group: string | null;
  available: boolean;
}

const GROUPS = ['Extras', 'Remove', 'Cooking', 'Milk', 'Sides', 'Custom'];

export default function ModifiersPage() {
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', price_adjustment: '0', modifier_group: 'Extras' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pos/modifiers');
      if (res.ok) { const d = await res.json(); setModifiers(d.modifiers ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    if (editId) {
      await fetch('/api/pos/modifiers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, name: form.name, price_adjustment: parseFloat(form.price_adjustment) || 0, modifier_group: form.modifier_group }),
      });
    } else {
      await fetch('/api/pos/modifiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, price_adjustment: parseFloat(form.price_adjustment) || 0, modifier_group: form.modifier_group }),
      });
    }
    setSaving(false);
    setShowAdd(false);
    setEditId(null);
    setForm({ name: '', price_adjustment: '0', modifier_group: 'Extras' });
    load();
  }

  async function deleteModifier(id: string) {
    if (!confirm('Delete this modifier?')) return;
    await fetch(`/api/pos/modifiers?id=${id}`, { method: 'DELETE' });
    load();
  }

  async function toggleAvailable(mod: Modifier) {
    await fetch('/api/pos/modifiers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mod.id, available: !mod.available }),
    });
    load();
  }

  function openEdit(mod: Modifier) {
    setForm({ name: mod.name, price_adjustment: String(mod.price_adjustment), modifier_group: mod.modifier_group ?? 'Extras' });
    setEditId(mod.id);
    setShowAdd(true);
  }

  const grouped: Record<string, Modifier[]> = {};
  for (const m of modifiers) {
    const g = m.modifier_group ?? 'Custom';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(m);
  }

  const inputCls = 'w-full bg-[rgba(0,0,0,0.04)] border border-[rgba(0,0,0,0.12)] rounded-xl px-3 py-2 text-sm text-[#1a1a16] outline-none focus:border-[#2563eb]';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Modifiers</h1>
          <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">Add-ons, remove items, customisations — attached to products</p>
        </div>
        <button onClick={() => { setForm({ name: '', price_adjustment: '0', modifier_group: 'Extras' }); setEditId(null); setShowAdd(true); }}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#1D9E75' }}>
          + Add modifier
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-[rgba(0,0,0,0.05)] rounded-xl animate-pulse" />)}</div>
      ) : modifiers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] p-10 text-center">
          <p className="text-4xl mb-3">⚙️</p>
          <p className="text-sm font-semibold text-[#1a1a16] mb-1">No modifiers yet</p>
          <p className="text-xs text-[rgba(26,26,22,0.4)] mb-4">Create modifiers like &ldquo;Extra shot +$0.80&rdquo; or &ldquo;No onion&rdquo; and attach them to products.</p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>
            Create your first modifier
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, mods]) => (
            <div key={group} className="bg-white rounded-2xl border border-[rgba(0,0,0,0.08)] overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]" style={{ background: '#fafaf8' }}>
                <p className="text-xs font-semibold text-[rgba(26,26,22,0.6)] uppercase tracking-wider">{group}</p>
              </div>
              <div className="divide-y divide-[rgba(0,0,0,0.05)]">
                {mods.map(mod => (
                  <div key={mod.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleAvailable(mod)}
                        className={`w-8 h-4 rounded-full transition-colors ${mod.available ? 'bg-[#1D9E75]' : 'bg-[rgba(0,0,0,0.15)]'}`}
                        style={{ position: 'relative' }}>
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${mod.available ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                      <p className={`text-sm font-medium ${mod.available ? 'text-[#1a1a16]' : 'text-[rgba(26,26,22,0.35)] line-through'}`}>
                        {mod.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className={`text-sm font-semibold ${mod.price_adjustment > 0 ? 'text-[#16a34a]' : mod.price_adjustment < 0 ? 'text-red-600' : 'text-[rgba(26,26,22,0.4)]'}`}>
                        {mod.price_adjustment === 0 ? 'Free' : `${mod.price_adjustment > 0 ? '+' : ''}A$${Math.abs(mod.price_adjustment).toFixed(2)}`}
                      </p>
                      <button onClick={() => openEdit(mod)} className="text-xs text-[rgba(26,26,22,0.4)] hover:text-[#2563eb] transition-colors">Edit</button>
                      <button onClick={() => deleteModifier(mod.id)} className="text-xs text-[rgba(26,26,22,0.3)] hover:text-red-600 transition-colors">×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1a1a16]">{editId ? 'Edit modifier' : 'Add modifier'}</h2>
              <button onClick={() => { setShowAdd(false); setEditId(null); }} className="text-[rgba(26,26,22,0.4)] text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,0.6)] mb-1.5">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} placeholder="e.g. Extra shot, No onion" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,0.6)] mb-1.5">Price adjustment (A$)</label>
                <input type="number" step="0.10" value={form.price_adjustment}
                  onChange={e => setForm(f => ({ ...f, price_adjustment: e.target.value }))}
                  className={inputCls} placeholder="0.00 for free" />
                <p className="text-[10px] text-[rgba(26,26,22,0.4)] mt-1">Use positive number to add cost, negative to reduce, 0 for free</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,0.6)] mb-1.5">Group</label>
                <input value={form.modifier_group} onChange={e => setForm(f => ({ ...f, modifier_group: e.target.value }))}
                  className={inputCls} placeholder="Extras" list="modifier-groups" />
                <datalist id="modifier-groups">
                  {GROUPS.map(g => <option key={g} value={g} />)}
                </datalist>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowAdd(false); setEditId(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,0.1)] text-[rgba(26,26,22,0.5)]">
                Cancel
              </button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: '#1D9E75' }}>
                {saving ? 'Saving…' : editId ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
