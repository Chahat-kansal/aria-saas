'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface PickList {
  id: string;
  pick_number: string;
  pick_type: 'standard' | 'wave' | 'zone';
  assigned_to: string | null;
  items: PickItem[];
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
}

interface PickItem {
  item_name: string;
}

interface PickForm {
  assigned_to: string;
  pick_type: 'standard' | 'wave' | 'zone';
  items_text: string;
  notes: string;
}

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-amber-900/30 text-amber-400',
  in_progress: 'bg-blue-900/30 text-blue-400',
  completed: 'bg-green-900/30 text-green-400',
  cancelled: 'bg-[rgba(255,255,255,0.06)] text-gray-400',
};

const BLANK_FORM: PickForm = { assigned_to: '', pick_type: 'standard', items_text: '', notes: '' };

export default function PickingPage() {
  const { business } = useBusinessContext();
  const [picks, setPicks] = useState<PickList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<PickForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchPicks = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/pick-lists?business_id=${business.id}`);
      const data = await res.json();
      setPicks(data.pick_lists ?? []);
    } catch {
      setPicks([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchPicks(); }, [fetchPicks]);

  const pending = picks.filter(p => p.status === 'pending').length;
  const in_progress = picks.filter(p => p.status === 'in_progress').length;
  const completed = picks.filter(p => p.status === 'completed').length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id) return;
    setSaving(true);
    try {
      const items = form.items_text
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .map(item_name => ({ item_name }));
      await fetch('/api/warehouse/pick-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, ...form, items }),
      });
      setForm(BLANK_FORM);
      setShowAdd(false);
      fetchPicks();
    } finally {
      setSaving(false);
    }
  }

  async function handleStart(id: string) {
    setActionId(id);
    try {
      await fetch(`/api/warehouse/pick-lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      fetchPicks();
    } finally {
      setActionId(null);
    }
  }

  async function handleComplete(id: string) {
    setActionId(id);
    try {
      await fetch(`/api/warehouse/pick-lists/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business?.id }),
      });
      fetchPicks();
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Pick Lists</h1>
          <p style={{ color: '#6b7280' }}>Manage warehouse pick lists and fulfilment tasks</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: '#1D9E75' }}
        >
          {showAdd ? 'Cancel' : '+ New Pick List'}
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending', value: pending, color: '#f59e0b' },
          { label: 'In Progress', value: in_progress, color: '#60a5fa' },
          { label: 'Completed', value: completed, color: '#1D9E75' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
            <p className="text-2xl font-semibold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleSubmit} className="rounded-xl p-5 mb-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-base font-semibold text-white mb-4">New Pick List</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Assigned To</label>
              <input
                value={form.assigned_to}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                placeholder="Staff member name"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Pick Type</label>
              <select
                value={form.pick_type}
                onChange={e => setForm(f => ({ ...f, pick_type: e.target.value as PickForm['pick_type'] }))}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <option value="standard">Standard</option>
                <option value="wave">Wave</option>
                <option value="zone">Zone</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1.5">Items (one per line)</label>
              <textarea
                value={form.items_text}
                onChange={e => setForm(f => ({ ...f, items_text: e.target.value }))}
                placeholder="Item A&#10;Item B&#10;Item C"
                rows={4}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none text-white resize-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1.5">Notes</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
              style={{ background: '#1D9E75' }}
            >
              {saving ? 'Saving…' : 'Create Pick List'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Pick #', 'Type', 'Assigned To', 'Items', 'Status', 'Created', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d0d14' }}>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
            ) : picks.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No pick lists yet. Create one above.</td></tr>
            ) : picks.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-4 py-3 text-white font-medium">{p.pick_number}</td>
                <td className="px-4 py-3 capitalize" style={{ color: '#9ca3af' }}>{p.pick_type}</td>
                <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{p.assigned_to ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{Array.isArray(p.items) ? p.items.length : 0}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[p.status] ?? STATUS_PILL.cancelled}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {p.status === 'pending' && (
                      <button
                        onClick={() => handleStart(p.id)}
                        disabled={actionId === p.id}
                        className="text-xs px-2.5 py-1 rounded-lg disabled:opacity-40"
                        style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}
                      >
                        Start
                      </button>
                    )}
                    {p.status === 'in_progress' && (
                      <button
                        onClick={() => handleComplete(p.id)}
                        disabled={actionId === p.id}
                        className="text-xs px-2.5 py-1 rounded-lg disabled:opacity-40"
                        style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}
                      >
                        Complete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
