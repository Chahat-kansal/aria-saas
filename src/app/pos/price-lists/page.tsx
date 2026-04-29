'use client';
import { useState, useEffect, useCallback } from 'react';

interface PriceList { id: string; name: string; description: string | null; is_active: boolean; item_count: number; created_at: string; }
interface PriceItem { id: string; product_id: string; price_override: number; pos_products: { id: string; name: string; price: number } | null; }

export default function PriceListsPage() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [selectedList, setSelectedList] = useState<PriceList | null>(null);
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', is_active: true });

  const load = useCallback(() => {
    fetch('/api/pos/price-lists').then(r => r.json()).then(d => { setLists(d.price_lists ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function loadItems(listId: string) {
    const res = await fetch(`/api/pos/price-lists?list_id=${listId}`).then(r => r.json()).catch(() => ({ items: [] }));
    setItems(res.items ?? []);
  }

  function selectList(list: PriceList) {
    setSelectedList(list);
    loadItems(list.id);
  }

  async function createList() {
    if (!form.name) return;
    setSaving(true);
    await fetch('/api/pos/price-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, description: form.description || null }) });
    setSaving(false); setShowAdd(false);
    setForm({ name: '', description: '', is_active: true });
    load();
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] outline-none';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div><h1 className="text-xl font-semibold text-[#1a1a16]">Price Lists</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Custom pricing for customer groups and promotions</p></div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#1D9E75' }}>+ New Price List</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: list of price lists */}
        <div className="lg:col-span-1">
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}</div>
          ) : lists.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-8 text-center shadow-sm">
              <p className="text-sm font-medium text-[#1a1a16] mb-1">No price lists</p>
              <p className="text-xs text-[rgba(26,26,22,.4)]">Create a price list to offer custom pricing.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lists.map(list => (
                <button key={list.id} onClick={() => selectList(list)} className={`w-full text-left bg-white rounded-xl border p-4 shadow-sm transition-all ${selectedList?.id === list.id ? 'border-[#1D9E75]' : 'border-[rgba(0,0,0,.08)] hover:border-[rgba(0,0,0,.15)]'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#1a1a16]">{list.name}</p>
                      {list.description && <p className="text-xs mt-0.5 text-[rgba(26,26,22,.4)]">{list.description}</p>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${list.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{list.is_active ? 'Active' : 'Off'}</span>
                  </div>
                  <p className="text-xs text-[rgba(26,26,22,.35)] mt-1">{list.item_count} items</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: items in selected list */}
        <div className="lg:col-span-2">
          {selectedList ? (
            <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-[rgba(0,0,0,.06)] flex items-center justify-between">
                <h2 className="font-semibold text-[#1a1a16]">{selectedList.name}</h2>
                <p className="text-xs text-[rgba(26,26,22,.4)]">{items.length} price overrides</p>
              </div>
              {items.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-medium text-[#1a1a16] mb-1">No price overrides</p>
                  <p className="text-xs text-[rgba(26,26,22,.4)]">Add products to this price list to override their standard price.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[rgba(0,0,0,.06)]">{['Product', 'Standard Price', 'Override Price', 'Savings'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[rgba(26,26,22,.4)]">{h}</th>)}</tr></thead>
                  <tbody>
                    {items.map(item => {
                      const std = item.pos_products?.price ?? 0;
                      const override = item.price_override;
                      const saving = std - override;
                      return (
                        <tr key={item.id} className="border-b border-[rgba(0,0,0,.04)]">
                          <td className="px-4 py-3 font-medium text-[#1a1a16]">{item.pos_products?.name ?? 'Unknown'}</td>
                          <td className="px-4 py-3 text-[rgba(26,26,22,.5)]">A${std.toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-[#1a1a16]">A${override.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm" style={{ color: saving > 0 ? '#1D9E75' : saving < 0 ? '#ef4444' : '#9ca3af' }}>{saving > 0 ? `-A$${saving.toFixed(2)}` : saving < 0 ? `+A$${Math.abs(saving).toFixed(2)}` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-12 text-center shadow-sm">
              <p className="text-sm text-[rgba(26,26,22,.4)]">Select a price list to view its items</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[rgba(0,0,0,.08)]">
            <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-[#1a1a16]">New Price List</h3><button onClick={() => setShowAdd(false)} className="text-gray-400">×</button></div>
            <div className="space-y-3">
              <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Wholesale Pricing" /></div>
              <div><label className="text-xs font-medium text-[rgba(26,26,22,.5)] mb-1 block">Description</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={inputCls} placeholder="Optional description" /></div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 accent-[#1D9E75]" /><span className="text-sm text-[#1a1a16]">Active</span></label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.12)] text-[rgba(26,26,22,.5)]">Cancel</button>
              <button onClick={createList} disabled={saving || !form.name} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>{saving ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
