'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface BomComponent {
  id: string;
  component_item_name: string;
  quantity_required: number;
  unit: string;
  notes: string | null;
}

interface Bom {
  id: string;
  finished_item_name: string;
  version: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  warehouse_bom_components: BomComponent[];
}

interface ComponentDraft { name: string; qty: string; unit: string; }

const DEFAULT_COMPONENT: ComponentDraft = { name: '', qty: '', unit: 'ea' };

export default function BomPage() {
  const { business } = useBusinessContext();
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ finished_item_name: '', notes: '' });
  const [components, setComponents] = useState<ComponentDraft[]>([{ ...DEFAULT_COMPONENT }]);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/warehouse/bom?business_id=${business.id}`).then(r => r.json()).catch(() => ({ boms: [] }));
    setBoms(res.boms ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  function addComponent() { setComponents(prev => [...prev, { ...DEFAULT_COMPONENT }]); }
  function removeComponent(i: number) { setComponents(prev => prev.filter((_, idx) => idx !== i)); }
  function updateComponent(i: number, field: keyof ComponentDraft, value: string) {
    setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  async function handleSave() {
    if (!business?.id || !form.finished_item_name.trim()) return;
    setSaving(true);
    await fetch('/api/warehouse/bom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        finished_item_name: form.finished_item_name,
        notes: form.notes,
        components: components.filter(c => c.name.trim()).map(c => ({
          component_item_name: c.name,
          quantity_required: parseFloat(c.qty) || 1,
          unit: c.unit,
        })),
      }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ finished_item_name: '', notes: '' });
    setComponents([{ ...DEFAULT_COMPONENT }]);
    load();
  }

  async function deactivate(id: string) {
    if (!business?.id) return;
    await fetch(`/api/warehouse/bom?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, is_active: false }),
    });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Bills of Materials</h1>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">New BOM</button>
      </div>

      {showAdd && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-white font-semibold">New Bill of Materials</h2>
          <input value={form.finished_item_name} onChange={e => setForm(f => ({ ...f, finished_item_name: e.target.value }))} placeholder="Finished item name" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          <div className="space-y-2">
            <p className="text-white/60 text-xs font-medium uppercase tracking-wide">Components</p>
            {components.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input value={c.name} onChange={e => updateComponent(i, 'name', e.target.value)} placeholder="Component name" className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
                <input value={c.qty} onChange={e => updateComponent(i, 'qty', e.target.value)} placeholder="Qty" type="number" className="w-20 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
                <input value={c.unit} onChange={e => updateComponent(i, 'unit', e.target.value)} placeholder="Unit" className="w-20 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
                <button onClick={() => removeComponent(i)} className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm">✕</button>
              </div>
            ))}
            <button onClick={addComponent} className="text-sm text-violet-400 hover:text-violet-300">+ Add component</button>
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save BOM'}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {loading ? (
          <p className="text-white/40 text-sm p-6">Loading…</p>
        ) : boms.length === 0 ? (
          <p className="text-white/40 text-sm p-6">No BOMs yet. Create your first bill of materials.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wide"><th className="text-left px-4 py-3">Finished Product</th><th className="text-left px-4 py-3">Components</th><th className="text-left px-4 py-3">Version</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Actions</th></tr></thead>
            <tbody>
              {boms.map(b => (
                <>
                  <tr key={b.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
                    <td className="px-4 py-3 text-white font-medium">{b.finished_item_name}</td>
                    <td className="px-4 py-3 text-white/60">{b.warehouse_bom_components.length} component{b.warehouse_bom_components.length !== 1 ? 's' : ''}</td>
                    <td className="px-4 py-3 text-white/60">v{b.version}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.is_active ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {b.is_active && <button onClick={() => deactivate(b.id)} className="text-xs text-red-400 hover:text-red-300">Deactivate</button>}
                    </td>
                  </tr>
                  {expandedId === b.id && (
                    <tr key={`${b.id}-exp`} className="bg-white/2">
                      <td colSpan={5} className="px-6 py-3">
                        <div className="space-y-1">
                          {b.warehouse_bom_components.map(c => (
                            <div key={c.id} className="flex gap-4 text-xs text-white/60">
                              <span className="text-white/80">{c.component_item_name}</span>
                              <span>{c.quantity_required} {c.unit}</span>
                              {c.notes && <span className="text-white/40">{c.notes}</span>}
                            </div>
                          ))}
                          {b.notes && <p className="text-xs text-white/40 mt-2">Note: {b.notes}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
