'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Serial {
  id: string;
  serial_number: string;
  item_name: string;
  item_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  in_stock: 'bg-green-500/20 text-green-400',
  sold: 'bg-blue-500/20 text-blue-400',
  returned: 'bg-amber-500/20 text-amber-400',
  quarantine: 'bg-red-500/20 text-red-400',
  lost: 'bg-white/10 text-white/40',
};

const FILTERS = ['all', 'in_stock', 'sold', 'quarantine', 'lost'] as const;
type Filter = typeof FILTERS[number];

export default function SerialsPage() {
  const { business } = useBusinessContext();
  const [serials, setSerials] = useState<Serial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const params = new URLSearchParams({ business_id: business.id });
    if (filter !== 'all') params.set('status', filter);
    const res = await fetch(`/api/warehouse/serials?${params}`).then(r => r.json()).catch(() => ({ serials: [] }));
    setSerials(res.serials ?? []);
    setLoading(false);
  }, [business?.id, filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = serials.filter(s =>
    !search || s.serial_number.toLowerCase().includes(search.toLowerCase()) || s.item_name.toLowerCase().includes(search.toLowerCase())
  );

  async function updateStatus(id: string, status: string) {
    if (!business?.id) return;
    await fetch(`/api/warehouse/serials?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, status }),
    });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Serial Numbers</h1>

      <div className="flex gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search serial number or item…" className="flex-1 min-w-48 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm" />
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>{f.replace('_', ' ')}</button>
          ))}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {loading ? (
          <p className="text-white/40 text-sm p-6">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-white/40 text-sm p-6">No serial numbers found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Serial #</th><th className="text-left px-4 py-3">Item</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Received</th><th className="text-left px-4 py-3">Notes</th><th className="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white font-mono text-xs">{s.serial_number}</td>
                  <td className="px-4 py-3 text-white/80">{s.item_name}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status] ?? 'bg-white/10 text-white/50'}`}>{s.status.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">{s.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select defaultValue="" onChange={e => { if (e.target.value) updateStatus(s.id, e.target.value); }} className="text-xs bg-white/5 border border-white/10 text-white/60 rounded px-2 py-1">
                      <option value="">Update…</option>
                      {['in_stock', 'sold', 'returned', 'quarantine', 'lost'].map(st => (
                        <option key={st} value={st}>{st.replace('_', ' ')}</option>
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
