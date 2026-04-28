'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface LineItem { item_id: string; item_name: string; current_stock: number; suggested_qty: number; reason: string; estimated_cost_aud: number; }
interface PO { id: string; po_number: string; status: string; supplier_name: string | null; created_at: string; expected_delivery: string | null; total_cost_cents: number; notes: string | null; line_items: LineItem[] | null; }

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  sent: '#60a5fa',
  confirmed: '#f59e0b',
  received: '#1D9E75',
  cancelled: '#ef4444',
};

export default function PurchaseOrdersPage() {
  const { business } = useBusinessContext();
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [aiItems, setAiItems] = useState<LineItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/warehouse/purchase-orders?business_id=${business.id}`).then(r => r.json()).catch(() => ({ orders: [] }));
    setOrders(res.orders ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function generateAI() {
    if (!business?.id) return;
    setGenerating(true);
    setAiItems([]);
    const res = await fetch('/api/aria/generate-purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    }).then(r => r.json()).catch(() => ({ orders: [] }));
    setAiItems(res.orders ?? []);
    setGenerating(false);
    load();
  }

  async function updateStatus(id: string, status: string) {
    if (!business?.id) return;
    await fetch(`/api/warehouse/purchase-orders?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, status }),
    });
    load();
  }

  async function deleteOrder(id: string) {
    if (!business?.id || !confirm('Delete this purchase order?')) return;
    await fetch(`/api/warehouse/purchase-orders?id=${id}&business_id=${business.id}`, { method: 'DELETE' });
    load();
  }

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Purchase Orders</h1>
          <p style={{ color: '#6b7280' }}>Manage supplier POs. Let Aria generate reorder suggestions automatically.</p>
        </div>
        <button onClick={generateAI} disabled={generating}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center gap-2"
          style={{ background: '#1D9E75' }}>
          {generating ? (
            <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</>
          ) : '✦ AI Generate POs'}
        </button>
      </div>

      {/* AI suggestions panel */}
      {aiItems.length > 0 && (
        <div className="mb-6 rounded-xl p-5" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: '#1D9E75' }} className="font-medium text-sm">✦ Aria generated {aiItems.length} reorder suggestions</span>
            <span className="text-xs" style={{ color: '#6b7280' }}>— saved as draft PO</span>
          </div>
          <div className="space-y-2">
            {aiItems.map((li, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{li.item_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{li.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-white">Qty: {li.suggested_qty}</p>
                  <p className="text-xs" style={{ color: '#9ca3af' }}>~A${li.estimated_cost_aud?.toFixed(0) ?? 0}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['all', 'draft', 'sent', 'confirmed', 'received', 'cancelled'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-xl text-xs capitalize transition-colors"
            style={statusFilter === s ? { background: '#1D9E75', color: '#fff' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
            {s}
          </button>
        ))}
      </div>

      {/* PO list */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-center py-8" style={{ color: '#4b5563' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm" style={{ color: '#6b7280' }}>No purchase orders yet. Click "AI Generate POs" to get started.</p>
          </div>
        ) : filtered.map(po => (
          <div key={po.id} className="rounded-xl overflow-hidden" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-white">{po.po_number}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: `${STATUS_COLORS[po.status]}22`, color: STATUS_COLORS[po.status] ?? '#6b7280' }}>
                    {po.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {po.supplier_name && <span className="text-xs" style={{ color: '#9ca3af' }}>{po.supplier_name}</span>}
                  <span className="text-xs" style={{ color: '#6b7280' }}>{new Date(po.created_at).toLocaleDateString()}</span>
                  {po.expected_delivery && <span className="text-xs" style={{ color: '#6b7280' }}>Due: {po.expected_delivery}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-white">A${((po.total_cost_cents ?? 0) / 100).toFixed(2)}</p>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{(po.line_items ?? []).length} items</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                  className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                  {expanded === po.id ? 'Hide' : 'View'}
                </button>
                {po.status === 'draft' && (
                  <button onClick={() => updateStatus(po.id, 'sent')}
                    className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
                    Send
                  </button>
                )}
                {po.status === 'sent' && (
                  <button onClick={() => updateStatus(po.id, 'confirmed')}
                    className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                    Confirm
                  </button>
                )}
                {po.status === 'confirmed' && (
                  <button onClick={() => updateStatus(po.id, 'received')}
                    className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>
                    Receive
                  </button>
                )}
                <button onClick={() => deleteOrder(po.id)}
                  className="text-xs px-2 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  ×
                </button>
              </div>
            </div>

            {expanded === po.id && (
              <div className="px-5 pb-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {po.notes && <p className="text-xs mt-3 mb-2" style={{ color: '#9ca3af' }}>{po.notes}</p>}
                {(po.line_items ?? []).length > 0 ? (
                  <table className="w-full text-xs mt-2">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {['Product', 'Current Stock', 'Order Qty', 'Est. Cost', 'Reason'].map(h => (
                          <th key={h} className="pb-2 text-left font-medium" style={{ color: '#6b7280' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(po.line_items ?? []).map((li, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td className="py-2 text-white">{li.item_name}</td>
                          <td className="py-2" style={{ color: '#9ca3af' }}>{li.current_stock}</td>
                          <td className="py-2 font-medium text-white">{li.suggested_qty}</td>
                          <td className="py-2" style={{ color: '#9ca3af' }}>A${li.estimated_cost_aud?.toFixed(2) ?? '—'}</td>
                          <td className="py-2" style={{ color: '#6b7280' }}>{li.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-xs mt-2" style={{ color: '#4b5563' }}>No line items.</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
