'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Location { id: string; label: string; zone: string; bay: string; }
interface Transfer { id: string; item_id: string; notes: string; created_at: string; }
interface Product { id: string; name: string; stock_quantity: number; }

export default function TransfersPage() {
  const { business } = useBusinessContext();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [itemId, setItemId] = useState('');
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [tRes, lRes, pRes] = await Promise.all([
      fetch(`/api/warehouse/transfer?business_id=${business.id}`).then(r => r.json()).catch(() => ({ transfers: [] })),
      fetch(`/api/warehouse/locations?business_id=${business.id}`).then(r => r.json()).catch(() => ({ locations: [] })),
      fetch(`/api/inventory/products?business_id=${business.id}`).then(r => r.json()).catch(() => ({ products: [] })),
    ]);
    setTransfers(tRes.transfers ?? []);
    setLocations(lRes.locations ?? []);
    setProducts(pRes.products ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!business?.id || !itemId || !toLoc) return;
    setSubmitting(true);
    await fetch('/api/warehouse/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, item_id: itemId, from_location_id: fromLoc || null, to_location_id: toLoc, quantity: qty, notes }),
    });
    setSubmitting(false);
    setDone(true);
    setItemId(''); setFromLoc(''); setToLoc(''); setQty(1); setNotes(''); setSearch('');
    load();
  }

  const filteredProducts = search ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : [];
  const selectedProduct = products.find(p => p.id === itemId);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Stock Transfers</h1>
        <p style={{ color: '#6b7280' }}>Move stock between bin locations. All movements are logged.</p>
      </div>

      {/* Transfer form */}
      <div className="rounded-xl p-5 mb-6" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
        <h2 className="text-white font-medium mb-4">New Transfer</h2>

        {done && (
          <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.2)' }}>
            <p className="text-sm" style={{ color: '#1D9E75' }}>Transfer logged. Item location updated.</p>
          </div>
        )}

        <div className="space-y-3">
          {/* Product search */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Product</label>
            {selectedProduct ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.2)' }}>
                <span className="text-sm text-white">{selectedProduct.name} <span style={{ color: '#6b7280' }}>(stock: {selectedProduct.stock_quantity})</span></span>
                <button onClick={() => { setItemId(''); setSearch(''); }} className="text-xs" style={{ color: '#6b7280' }}>✕</button>
              </div>
            ) : (
              <div className="relative">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product…"
                  className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }} />
                {filteredProducts.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-xl z-10" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {filteredProducts.slice(0, 6).map(p => (
                      <button key={p.id} onClick={() => { setItemId(p.id); setSearch(''); }}
                        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/5 transition-colors">
                        {p.name} <span style={{ color: '#6b7280' }}>— stock: {p.stock_quantity}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">From location (optional)</label>
              <select value={fromLoc} onChange={e => setFromLoc(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <option value="" style={{ background: '#1a1a2e' }}>— None —</option>
                {locations.map(l => <option key={l.id} value={l.id} style={{ background: '#1a1a2e' }}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">To location *</label>
              <select value={toLoc} onChange={e => setToLoc(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <option value="" style={{ background: '#1a1a2e' }}>Select location…</option>
                {locations.map(l => <option key={l.id} value={l.id} style={{ background: '#1a1a2e' }}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Quantity</label>
              <input type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Restocking bay 3"
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }} />
            </div>
          </div>

          <button onClick={submit} disabled={submitting || !itemId || !toLoc}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
            style={{ background: '#1D9E75' }}>
            {submitting ? 'Logging transfer…' : 'Log Transfer'}
          </button>
        </div>
      </div>

      {/* Recent transfers */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-3" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-sm font-medium text-white">Recent Transfers</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Date', 'Item', 'Notes'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d0d14' }}>
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
            ) : transfers.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-sm" style={{ color: '#4b5563' }}>No transfers yet.</td></tr>
            ) : transfers.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-white text-xs font-mono">{t.item_id.slice(0, 8)}…</td>
                <td className="px-4 py-3 text-xs" style={{ color: '#9ca3af' }}>{t.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
