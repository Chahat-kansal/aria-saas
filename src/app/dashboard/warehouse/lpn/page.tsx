'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface LPN {
  id: string;
  lpn_number: string;
  lpn_type: string;
  location_name: string | null;
  items: Array<{ item_name: string }> | null;
  weight_kg: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  empty: 'bg-white/10 text-white/40',
  despatched: 'bg-blue-500/20 text-blue-400',
  quarantine: 'bg-amber-500/20 text-amber-400',
};

const LPN_TYPES = ['pallet', 'carton', 'tote', 'bin'] as const;

export default function LpnPage() {
  const { business } = useBusinessContext();
  const [lpns, setLpns] = useState<LPN[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ lpn_number: '', lpn_type: 'carton', notes: '' });

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const params = new URLSearchParams({ business_id: business.id });
    if (search.trim()) params.set('lpn_number', search.trim());
    const res = await fetch(`/api/warehouse/lpn?${params}`).then(r => r.json()).catch(() => ({ lpns: [] }));
    setLpns(res.lpns ?? []);
    setLoading(false);
  }, [business?.id, search]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!business?.id || !form.lpn_number.trim()) return;
    setSaving(true);
    await fetch('/api/warehouse/lpn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, lpn_number: form.lpn_number, lpn_type: form.lpn_type, notes: form.notes || undefined }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ lpn_number: '', lpn_type: 'carton', notes: '' });
    load();
  }

  async function updateStatus(id: string, status: string) {
    if (!business?.id) return;
    await fetch(`/api/warehouse/lpn?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, status }),
    });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Pallet &amp; Carton Tracking (LPN)</h1>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">New LPN</button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by LPN number…" className="w-full max-w-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />

      {showAdd && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-white font-semibold">New LPN</h2>
          <input value={form.lpn_number} onChange={e => setForm(f => ({ ...f, lpn_number: e.target.value }))} placeholder="LPN number (e.g. PLT-00123)" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          <select value={form.lpn_type} onChange={e => setForm(f => ({ ...f, lpn_type: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
            {LPN_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Create LPN'}</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {loading ? (
          <p className="text-white/40 text-sm p-6">Loading…</p>
        ) : lpns.length === 0 ? (
          <p className="text-white/40 text-sm p-6">No LPNs found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">LPN #</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Location</th><th className="text-left px-4 py-3">Items</th><th className="text-left px-4 py-3">Weight</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {lpns.map(l => (
                <tr key={l.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white font-mono text-xs">{l.lpn_number}</td>
                  <td className="px-4 py-3 text-white/60 capitalize">{l.lpn_type}</td>
                  <td className="px-4 py-3 text-white/60">{l.location_name ?? '—'}</td>
                  <td className="px-4 py-3 text-white/60">{l.items?.length ?? 0}</td>
                  <td className="px-4 py-3 text-white/60">{l.weight_kg != null ? `${l.weight_kg} kg` : '—'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[l.status] ?? 'bg-white/10 text-white/50'}`}>{l.status}</span></td>
                  <td className="px-4 py-3">
                    <select defaultValue="" onChange={e => { if (e.target.value) updateStatus(l.id, e.target.value); }} className="text-xs bg-white/5 border border-white/10 text-white/60 rounded px-2 py-1">
                      <option value="">Update…</option>
                      {['active', 'empty', 'despatched', 'quarantine'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
