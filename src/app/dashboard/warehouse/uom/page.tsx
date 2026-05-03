'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface UOM { id: string; name: string; base_unit: string; conversion_factor: number; }

export default function UOMPage() {
  const { business } = useBusinessContext();
  const [uoms, setUoms] = useState<UOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', base_unit: 'each', conversion_factor: '' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    const d = await fetch(`/api/warehouse/uom?business_id=${business.id}`).then(r => r.json());
    setUoms(d.uoms ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!business?.id || !form.name || !form.base_unit || !form.conversion_factor) return;
    setSaving(true);
    if (editId) {
      await fetch(`/api/warehouse/uom?id=${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, ...form, conversion_factor: parseFloat(form.conversion_factor) }),
      });
      setEditId(null);
    } else {
      await fetch('/api/warehouse/uom', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, ...form }),
      });
    }
    setForm({ name: '', base_unit: 'each', conversion_factor: '' });
    setSaving(false);
    load();
  }

  async function remove(id: string) {
    if (!business?.id || !confirm('Delete this unit of measure?')) return;
    await fetch(`/api/warehouse/uom?id=${id}&business_id=${business.id}`, { method: 'DELETE' });
    load();
  }

  const preview = form.name && form.base_unit && form.conversion_factor
    ? `1 ${form.name} = ${form.conversion_factor} ${form.base_unit}`
    : '';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Units of Measure</h1>
        <p style={{ color: '#6b7280' }} className="mt-1">Define how products are bought, stored, and sold in different quantities</p>
      </div>

      {/* Examples */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { title: 'Carton → Each', desc: 'Buy in cartons of 24, sell each' },
          { title: 'Pallet → Case', desc: 'Buy in pallets of 60 cases, sell cases' },
          { title: 'Kg → 500g pack', desc: 'Buy in kg, sell 500g packs' },
        ].map(ex => (
          <div key={ex.title} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-medium text-white mb-0.5">{ex.title}</p>
            <p className="text-[11px]" style={{ color: '#6b7280' }}>{ex.desc}</p>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      <div className="rounded-xl p-5 mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <h2 className="text-sm font-medium text-white mb-4">{editId ? 'Edit Unit of Measure' : 'Add Unit of Measure'}</h2>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Name (e.g. Carton)</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              placeholder="Carton" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Base unit (e.g. each)</label>
            <input value={form.base_unit} onChange={e => setForm(f => ({ ...f, base_unit: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              placeholder="each" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Conversion factor</label>
            <input type="number" min="0.001" step="0.001" value={form.conversion_factor}
              onChange={e => setForm(f => ({ ...f, conversion_factor: e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              placeholder="24" />
          </div>
        </div>
        {preview && <p className="text-xs text-[#1D9E75] mb-3">Preview: {preview}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !form.name || !form.conversion_factor}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: '#1D9E75', color: '#fff' }}>
            {saving ? 'Saving…' : editId ? 'Update' : 'Add UOM'}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ name: '', base_unit: 'each', conversion_factor: '' }); }}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
      ) : uoms.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">No units of measure defined yet</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="grid grid-cols-4 gap-4 px-4 py-2.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span>Name</span><span>Base Unit</span><span>Conversion</span><span>Actions</span>
          </div>
          {uoms.map(u => (
            <div key={u.id} className="grid grid-cols-4 gap-4 px-4 py-3 items-center"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="text-sm text-white font-medium">{u.name}</span>
              <span className="text-sm text-gray-400">{u.base_unit}</span>
              <span className="text-sm text-gray-300">× {u.conversion_factor}</span>
              <div className="flex gap-2">
                <button onClick={() => { setEditId(u.id); setForm({ name: u.name, base_unit: u.base_unit, conversion_factor: String(u.conversion_factor) }); }}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>Edit</button>
                <button onClick={() => remove(u.id)}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded"
                  style={{ background: 'rgba(239,68,68,0.08)' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
