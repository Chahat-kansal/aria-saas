'use client';
import { useState, useEffect, useCallback } from 'react';

interface Transfer {
  id: string;
  transfer_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  from_outlet: { name: string } | null;
  to_outlet: { name: string } | null;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
}

interface Outlet {
  id: string;
  name: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [outlets,   setOutlets]   = useState<Outlet[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);

  // New transfer form
  const [fromOutlet, setFromOutlet] = useState('');
  const [toOutlet,   setToOutlet]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [items,      setItems]      = useState<{ product_id: string; quantity: number }[]>([{ product_id: '', quantity: 1 }]);
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tr, pr, ol] = await Promise.all([
        fetch('/api/pos/transfers').then(r => r.json()),
        fetch('/api/pos/products').then(r => r.json()),
        fetch('/api/pos/outlets').then(r => r.json()).catch(() => ({ outlets: [] })),
      ]);
      setTransfers(tr.transfers ?? []);
      setProducts((pr.products ?? []) as Product[]);
      setOutlets(ol.outlets ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!fromOutlet || !toOutlet || items.some(i => !i.product_id)) return;
    setSaving(true);
    try {
      await fetch('/api/pos/transfers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_outlet_id: fromOutlet, to_outlet_id: toOutlet, items, notes }),
      });
      setShowNew(false);
      setFromOutlet(''); setToOutlet(''); setNotes('');
      setItems([{ product_id: '', quantity: 1 }]);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/pos/transfers?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <div className="min-h-full bg-gray-50 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stock Transfers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Move stock between outlets and locations</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors">
          + New Transfer
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

        {/* New transfer form */}
        {showNew && (
          <div className="bg-white border border-violet-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4">New Stock Transfer</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From outlet</label>
                {outlets.length > 0 ? (
                  <select value={fromOutlet} onChange={e => setFromOutlet(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                    <option value="">Select outlet…</option>
                    {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : (
                  <input value={fromOutlet} onChange={e => setFromOutlet(e.target.value)}
                    placeholder="Main location"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To outlet</label>
                {outlets.length > 0 ? (
                  <select value={toOutlet} onChange={e => setToOutlet(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                    <option value="">Select outlet…</option>
                    {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : (
                  <input value={toOutlet} onChange={e => setToOutlet(e.target.value)}
                    placeholder="Destination location"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" />
                )}
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2 mb-4">
              <label className="block text-xs font-medium text-gray-500">Items to transfer</label>
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <select value={item.product_id} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, product_id: e.target.value } : it))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                    <option value="">Select product…</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''} — {p.stock_quantity} in stock</option>)}
                  </select>
                  <input type="number" min="1" value={item.quantity}
                    onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 1 } : it))}
                    className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none text-center" />
                  {items.length > 1 && (
                    <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="px-2 text-gray-400 hover:text-red-500 text-lg">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => setItems(prev => [...prev, { product_id: '', quantity: 1 }])}
                className="text-xs text-violet-600 hover:text-violet-700 font-medium">+ Add another item</button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for transfer…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={submit} disabled={saving}
                className="px-5 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40 transition-colors">
                {saving ? 'Creating…' : 'Create Transfer'}
              </button>
              <button onClick={() => setShowNew(false)}
                className="px-5 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Transfer list */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          </div>
        ) : transfers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-2xl mb-2">🔄</p>
            <p className="text-sm text-gray-500">No transfers yet.</p>
            <p className="text-xs text-gray-400 mt-1">Create a transfer to move stock between outlets.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Transfer #', 'From', 'To', 'Date', 'Status', 'Notes', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-violet-600 font-medium">{t.transfer_number}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{t.from_outlet?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{t.to_outlet?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString('en-AU')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">{t.notes ?? '—'}</td>
                    <td className="px-4 py-3">
                      {t.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => updateStatus(t.id, 'completed')}
                            className="text-[10px] px-2 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                            Complete
                          </button>
                          <button onClick={() => updateStatus(t.id, 'cancelled')}
                            className="text-[10px] px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
