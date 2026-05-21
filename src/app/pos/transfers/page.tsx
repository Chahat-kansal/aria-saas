'use client';
import { useState, useEffect, useCallback } from 'react';

interface Transfer {
  id: string;
  transfer_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  shipped_at?: string | null;
  received_at?: string | null;
  total_variance_units?: number;
  total_variance_cost?: number;
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
  draft:      'bg-gray-100 text-gray-700',
  requested:  'bg-amber-50 text-amber-700',
  approved:   'bg-blue-50 text-blue-700',
  in_transit: 'bg-violet-50 text-violet-700',
  received:   'bg-emerald-50 text-emerald-700',
  reconciled: 'bg-green-100 text-green-800',
  cancelled:  'bg-red-50 text-red-600',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', requested: 'Pending Approval', approved: 'Approved',
  in_transit: 'In Transit', received: 'Received', reconciled: 'Reconciled', cancelled: 'Cancelled',
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [outlets,   setOutlets]   = useState<Outlet[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);

  // New transfer form
  const [fromOutlet,       setFromOutlet]       = useState('');
  const [toOutlet,         setToOutlet]         = useState('');
  const [notes,            setNotes]            = useState('');
  const [submitForApproval, setSubmitForApproval] = useState(false);
  const [items, setItems] = useState<{ product_id: string; quantity_requested: number }[]>([{ product_id: '', quantity_requested: 1 }]);
  const [saving, setSaving] = useState(false);

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
    if (!fromOutlet || !toOutlet || fromOutlet === toOutlet || items.some(i => !i.product_id)) return;
    setSaving(true);
    try {
      const itemsPayload = items.map(i => ({
        product_id: i.product_id,
        product_name: products.find(p => p.id === i.product_id)?.name ?? '',
        quantity_requested: i.quantity_requested,
      }));
      await fetch('/api/pos/transfers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_outlet_id: fromOutlet, to_outlet_id: toOutlet, items: itemsPayload, notes, submit_for_approval: submitForApproval }),
      });
      setShowNew(false);
      setFromOutlet(''); setToOutlet(''); setNotes(''); setSubmitForApproval(false);
      setItems([{ product_id: '', quantity_requested: 1 }]);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function transition(transferId: string, toStatus: string, extras?: Record<string, unknown>) {
    const r = await fetch(`/api/pos/transfers/${transferId}/transition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: toStatus, ...extras }),
    });
    if (r.ok) { await load(); }
    else { const e = await r.json(); alert(e.error ?? 'Transition failed'); }
  }

  function confirmCancel(transferId: string) {
    const reason = prompt('Reason for cancellation?');
    if (reason === null) return;
    transition(transferId, 'cancelled', { cancellation_reason: reason || 'No reason given' });
  }

  return (
    <div className="min-h-full bg-gray-50 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stock Transfers</h1>
          <p className="text-sm text-gray-500 mt-0.5">6-stage workflow: draft → approval → in transit → received → reconciled</p>
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
                  <input value={fromOutlet} onChange={e => setFromOutlet(e.target.value)} placeholder="Main location"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To outlet</label>
                {outlets.length > 0 ? (
                  <select value={toOutlet} onChange={e => setToOutlet(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                    <option value="">Select outlet…</option>
                    {outlets.filter(o => o.id !== fromOutlet).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : (
                  <input value={toOutlet} onChange={e => setToOutlet(e.target.value)} placeholder="Destination location"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" />
                )}
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <label className="block text-xs font-medium text-gray-500">Items to transfer</label>
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <select value={item.product_id} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, product_id: e.target.value } : it))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                    <option value="">Select product…</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''} — {p.stock_quantity ?? 0} in stock</option>)}
                  </select>
                  <input type="number" min="1" value={item.quantity_requested}
                    onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity_requested: parseInt(e.target.value) || 1 } : it))}
                    className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none text-center" />
                  {items.length > 1 && (
                    <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="px-2 text-gray-400 hover:text-red-500 text-lg">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => setItems(prev => [...prev, { product_id: '', quantity_requested: 1 }])}
                className="text-xs text-violet-600 hover:text-violet-700 font-medium">+ Add another item</button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for transfer…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
              <input type="checkbox" checked={submitForApproval} onChange={e => setSubmitForApproval(e.target.checked)} />
              Submit for approval immediately
            </label>

            <div className="flex gap-2">
              <button onClick={submit} disabled={saving}
                className="px-5 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40 transition-colors">
                {saving ? 'Creating…' : submitForApproval ? 'Create & Request Approval' : 'Save as Draft'}
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
          <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
            <p className="text-2xl mb-2">🔄</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No transfers yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary, #6E7C6E)' }}>Create a transfer to move stock between outlets.</p>
            {outlets.length < 2 && (
              <div className="mt-4 rounded-xl p-4 text-left max-w-xs mx-auto" style={{ background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.4)' }}>
                <div className="text-sm font-semibold text-[#FFB347]">You only have {outlets.length === 0 ? 'no' : '1'} outlet</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Inventory transfers move stock between outlets. Create a second outlet first.</div>
                <a href="/pos/settings/registers" className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: '#2D5240', color: '#006AFF' }}>+ Add outlet</a>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Transfer #', 'From', 'To', 'Date', 'Status', 'Actions'].map(h => (
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
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                      {t.status === 'reconciled' && (Number(t.total_variance_units) || 0) !== 0 && (
                        <span className="ml-1 text-[10px] text-red-600 font-medium">
                          ({(Number(t.total_variance_units) || 0) > 0 ? '+' : ''}{Number(t.total_variance_units) || 0} units)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {t.status === 'draft' && (
                          <button onClick={() => transition(t.id, 'requested')}
                            className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                            Submit
                          </button>
                        )}
                        {t.status === 'requested' && (
                          <button onClick={() => transition(t.id, 'approved')}
                            className="text-[10px] px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">
                            Approve
                          </button>
                        )}
                        {t.status === 'approved' && (
                          <button onClick={() => transition(t.id, 'in_transit')}
                            className="text-[10px] px-2 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors">
                            Ship
                          </button>
                        )}
                        {t.status === 'in_transit' && (
                          <button onClick={() => transition(t.id, 'received')}
                            className="text-[10px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                            Receive
                          </button>
                        )}
                        {t.status === 'received' && (
                          <button onClick={() => {
                            const reason = prompt('Variance reason (leave blank if none):\ndamaged_in_transit · miscounted · lost · theft · overshipped · other')
                            if (reason === null) return // cancelled
                            transition(t.id, 'reconciled', reason ? { item_updates: [{ variance_reason: reason }] } : {})
                          }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 transition-colors">
                            Reconcile
                          </button>
                        )}
                        {['draft', 'requested', 'approved'].includes(t.status) && (
                          <button onClick={() => confirmCancel(t.id)}
                            className="text-[10px] px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
                            Cancel
                          </button>
                        )}
                      </div>
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
