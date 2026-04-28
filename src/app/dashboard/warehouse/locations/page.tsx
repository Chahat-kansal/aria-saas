'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Location { id: string; label: string; zone: string; bay: string; shelf: string; temperature_zone: string; }
interface SlottingSuggestion { item_id: string; item_name: string; current_location: string | null; suggested_zone: string; suggested_reason: string; velocity_rank: string; }
interface ItemLocation { item_id: string; item_name: string; location_id: string; location_label: string; zone: string; bay: string; }

const ZONES = ['A', 'B', 'C', 'D'];
const TEMP_ZONES = ['ambient', 'chilled', 'frozen'];

export default function LocationsPage() {
  const { business } = useBusinessContext();
  const [tab, setTab] = useState<'map' | 'find'>('map');
  const [locations, setLocations] = useState<Location[]>([]);
  const [suggestions, setSuggestions] = useState<SlottingSuggestion[]>([]);
  const [itemLocs, setItemLocs] = useState<ItemLocation[]>([]);
  const [loadingLocs, setLoadingLocs] = useState(true);
  const [loadingSlotting, setLoadingSlotting] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ItemLocation[]>([]);

  // Bulk setup wizard state
  const [setupZone, setSetupZone] = useState('A');
  const [setupBays, setSetupBays] = useState(5);
  const [setupShelves, setSetupShelves] = useState(4);
  const [setupTemp, setSetupTemp] = useState('ambient');
  const [creating, setCreating] = useState(false);
  const [setupDone, setSetupDone] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoadingLocs(true);
    const [locsRes, ilRes] = await Promise.all([
      fetch(`/api/warehouse/locations?business_id=${business.id}`).then(r => r.json()).catch(() => ({ locations: [] })),
      fetch(`/api/warehouse/item-locations?business_id=${business.id}`).then(r => r.json()).catch(() => ({ items: [] })),
    ]);
    setLocations(locsRes.locations ?? []);
    setItemLocs(ilRes.items ?? []);
    setLoadingLocs(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function createZone() {
    if (!business?.id) return;
    setCreating(true);
    await fetch('/api/warehouse/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, bulk: true, zone: setupZone, bay_count: setupBays, shelf_count: setupShelves, temperature_zone: setupTemp }),
    });
    setCreating(false);
    setSetupDone(true);
    load();
  }

  async function deleteLocation(id: string) {
    await fetch(`/api/warehouse/locations?id=${id}`, { method: 'DELETE' });
    load();
  }

  async function runSlotting() {
    if (!business?.id) return;
    setLoadingSlotting(true);
    const res = await fetch('/api/aria/warehouse-slotting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    }).then(r => r.json()).catch(() => ({ suggestions: [] }));
    setSuggestions(res.suggestions ?? []);
    setLoadingSlotting(false);
  }

  function doSearch(q: string) {
    setSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const lower = q.toLowerCase();
    setSearchResults(itemLocs.filter(il => il.item_name?.toLowerCase().includes(lower)));
  }

  const zoneGroups = ZONES.map(z => ({
    zone: z,
    locs: locations.filter(l => l.zone === z),
  })).filter(g => g.locs.length > 0);

  const zonesWithLocs = [...new Set(locations.map(l => l.zone))].sort();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Bin Locations</h1>
        <p style={{ color: '#6b7280' }}>Manage warehouse bin assignments. Run AI slotting to optimise picks.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['map', 'find'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors"
            style={tab === t ? { background: '#1D9E75', color: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            {t === 'map' ? 'Location Map' : 'Find Product'}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <div className="space-y-6">
          {/* Zone setup card */}
          <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 className="text-white font-medium mb-4">Add / Generate Zone</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Zone</label>
                <select value={setupZone} onChange={e => setSetupZone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {ZONES.map(z => <option key={z} value={z} style={{ background: '#1a1a2e' }}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Bays</label>
                <input type="number" min={1} max={50} value={setupBays} onChange={e => setSetupBays(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Shelves/Bay</label>
                <input type="number" min={1} max={20} value={setupShelves} onChange={e => setSetupShelves(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Temp Zone</label>
                <select value={setupTemp} onChange={e => setSetupTemp(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {TEMP_ZONES.map(t => <option key={t} value={t} style={{ background: '#1a1a2e' }}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={createZone} disabled={creating}
                  className="w-full py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: '#1D9E75' }}>
                  {creating ? 'Creating…' : `Generate ${setupZone} (${setupBays * setupShelves} bins)`}
                </button>
              </div>
            </div>
            {setupDone && <p className="text-xs" style={{ color: '#1D9E75' }}>Zone created successfully.</p>}
          </div>

          {/* AI Slotting */}
          <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-medium">AI Slotting Recommendations</h2>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Aria analyses 30-day velocity and suggests optimal bin zones.</p>
              </div>
              <button onClick={runSlotting} disabled={loadingSlotting || !locations.length}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center gap-2"
                style={{ background: 'rgba(29,158,117,0.15)', border: '1px solid rgba(29,158,117,0.3)' }}>
                {loadingSlotting ? (
                  <><span className="inline-block w-3 h-3 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />Analysing…</>
                ) : '✦ Run AI Slotting'}
              </button>
            </div>

            {suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-0.5 ${s.velocity_rank === 'high' ? 'bg-green-900/30 text-green-400' : s.velocity_rank === 'medium' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-gray-800 text-gray-400'}`}>
                      {s.velocity_rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{s.item_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{s.suggested_reason}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-white">Zone {s.suggested_zone}</p>
                      {s.current_location && <p className="text-xs" style={{ color: '#6b7280' }}>Was: {s.current_location}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-center py-4" style={{ color: '#4b5563' }}>
                {locations.length === 0 ? 'Generate locations first, then run AI slotting.' : 'Click "Run AI Slotting" to get recommendations.'}
              </p>
            )}
          </div>

          {/* Location grid */}
          {loadingLocs ? (
            <p className="text-sm text-center py-8" style={{ color: '#4b5563' }}>Loading…</p>
          ) : zoneGroups.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#4b5563' }}>No locations yet. Use the zone generator above to get started.</p>
          ) : (
            zoneGroups.map(({ zone, locs }) => {
              const bays = [...new Set(locs.map(l => l.bay))].sort((a, b) => parseInt(a) - parseInt(b));
              return (
                <div key={zone} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg font-semibold text-white">Zone {zone}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>{locs.length} bins</span>
                    {locs[0]?.temperature_zone && locs[0].temperature_zone !== 'ambient' && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{locs[0].temperature_zone}</span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-xs">
                      <thead>
                        <tr>
                          <th className="pr-4 pb-2 text-left font-medium" style={{ color: '#6b7280' }}>Shelf ↓ / Bay →</th>
                          {bays.map(b => <th key={b} className="px-2 pb-2 text-center font-medium" style={{ color: '#6b7280' }}>B{b}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {[...new Set(locs.map(l => l.shelf))].sort((a, b) => parseInt(a) - parseInt(b)).map(shelf => (
                          <tr key={shelf}>
                            <td className="pr-4 py-1 font-medium" style={{ color: '#9ca3af' }}>S{shelf}</td>
                            {bays.map(bay => {
                              const loc = locs.find(l => l.bay === bay && l.shelf === shelf);
                              const occupied = loc ? itemLocs.some(il => il.location_label === loc.label) : false;
                              return (
                                <td key={bay} className="px-2 py-1 text-center">
                                  {loc ? (
                                    <span
                                      title={`${loc.label} — click to delete`}
                                      onClick={() => { if (confirm(`Delete ${loc.label}?`)) deleteLocation(loc.id); }}
                                      className="inline-block px-2 py-0.5 rounded cursor-pointer"
                                      style={{ background: occupied ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.05)', color: occupied ? '#1D9E75' : '#6b7280', border: `1px solid ${occupied ? 'rgba(29,158,117,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                                      {loc.label}
                                    </span>
                                  ) : <span style={{ color: 'rgba(255,255,255,0.1)' }}>—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'find' && (
        <div className="space-y-4">
          <div>
            <input
              value={search}
              onChange={e => doSearch(e.target.value)}
              placeholder="Search by product name or SKU…"
              className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none"
              style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          {search && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['Product', 'Zone', 'Bay', 'Bin Label'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ background: '#0d0d14' }}>
                  {searchResults.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm" style={{ color: '#4b5563' }}>No products found in "{search}"</td></tr>
                  ) : searchResults.map(il => (
                    <tr key={`${il.item_id}-${il.location_id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-3 text-white">{il.item_name}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>Zone {il.zone}</span></td>
                      <td className="px-4 py-3" style={{ color: '#9ca3af' }}>Bay {il.bay}</td>
                      <td className="px-4 py-3 font-mono text-xs text-white">{il.location_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!search && (
            <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm" style={{ color: '#6b7280' }}>Enter a product name or SKU to find its bin location.</p>
              <p className="text-xs mt-1" style={{ color: '#4b5563' }}>{itemLocs.length} products assigned to bins</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
