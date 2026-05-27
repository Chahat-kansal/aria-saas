'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { AriaSays } from '@/components/dashboard/AriaSays';

interface MissedItem {
  id: string;
  product_name: string;
  product_barcode?: string;
  product_category?: string;
  times_requested: number;
  estimated_quantity_wanted: number;
  approximate_price_point_cents?: number;
  customer_note?: string;
  last_requested_at: string;
  status: string;
  aria_analysis?: string;
  aria_confidence?: string;
  estimated_monthly_revenue_cents?: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'rgba(251,191,36,0.15)',
  analysed: 'rgba(29,158,117,0.15)',
  suggested: 'rgba(99,102,241,0.15)',
  accepted: 'rgba(16,185,129,0.2)',
  rejected: 'rgba(239,68,68,0.1)',
  stocked: 'rgba(29,158,117,0.25)',
};
const STATUS_TEXT: Record<string, string> = {
  pending: '#fbbf24', analysed: '#1D9E75', suggested: '#818cf8',
  accepted: '#10b981', rejected: '#ef4444', stocked: '#1D9E75',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MissedDemandPage() {
  const { business } = useBusinessContext();
  const [items, setItems] = useState<MissedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ product_name: '', product_category: '', customer_note: '', estimated_quantity_wanted: '1' });
  const [adding, setAdding] = useState(false);
  const [totalOpportunity, setTotalOpportunity] = useState(0);

  const fetchItems = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pos/missed-demand?business_id=${business.id}&status=${statusFilter}`);
      const data = await res.json();
      setItems(data.items ?? []);
      const opp = (data.items ?? []).reduce((s: number, i: MissedItem) => s + (i.estimated_monthly_revenue_cents ?? 0), 0);
      setTotalOpportunity(opp);
    } finally {
      setLoading(false);
    }
  }, [business?.id, statusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function analyzeItem(item: MissedItem) {
    if (!business?.id) return;
    setAnalyzing(item.id);
    try {
      await fetch('/api/aria/missed-demand-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, missed_demand_id: item.id }),
      });
      fetchItems();
    } finally {
      setAnalyzing(null);
    }
  }

  async function updateStatus(id: string, status: string) {
    if (!business?.id) return;
    await fetch('/api/pos/missed-demand', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, business_id: business.id, status }),
    });
    fetchItems();
  }

  async function addMissedItem() {
    if (!business?.id || !addForm.product_name.trim()) return;
    setAdding(true);
    try {
      await fetch('/api/pos/missed-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          product_name: addForm.product_name.trim(),
          product_category: addForm.product_category || undefined,
          customer_note: addForm.customer_note || undefined,
          estimated_quantity_wanted: parseInt(addForm.estimated_quantity_wanted) || 1,
          logged_by: 'manual',
        }),
      });
      setShowAddModal(false);
      setAddForm({ product_name: '', product_category: '', customer_note: '', estimated_quantity_wanted: '1' });
      fetchItems();
    } finally {
      setAdding(false);
    }
  }

  const pending = items.filter(i => i.status === 'pending').length;
  const analysed = items.filter(i => i.status === 'analysed').length;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#0d0d14' }}>
      <div style={{ padding: '16px 24px 0' }}>
        <AriaSays businessId={business?.id ?? null} page="missed-demand" />
      </div>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div>
          <h1 className="font-semibold text-white text-lg">Missed Demand</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            Products customers asked for that you didn't have
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: '#1D9E75', color: '#fff' }}>
          + Log Missed Sale
        </button>
      </div>

      <div className="p-6 space-y-5 max-w-5xl mx-auto w-full">
        {/* Opportunity banner */}
        {totalOpportunity > 0 && (
          <div className="rounded-xl p-4 border" style={{ background: 'rgba(29,158,117,0.08)', borderColor: 'rgba(29,158,117,0.2)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[rgba(29,158,117,0.2)] flex items-center justify-center flex-shrink-0">
                <span className="text-[#1D9E75] font-bold text-sm">A</span>
              </div>
              <div>
                <p className="text-white text-sm font-medium">
                  Aria estimates <span className="text-[#1D9E75]">A${(totalOpportunity / 100).toFixed(0)}/month</span> in recoverable revenue from {analysed} analysed items.
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Stock the highest-confidence items to capture this demand.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Logged', value: items.length, color: '#fff' },
            { label: 'Pending Analysis', value: pending, color: '#fbbf24' },
            { label: 'Analysed', value: analysed, color: '#1D9E75' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl p-4 border"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{stat.label}</p>
              <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'analysed', 'suggested', 'accepted', 'stocked', 'rejected'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs capitalize transition-all"
              style={{
                background: statusFilter === s ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.04)',
                color: statusFilter === s ? '#1D9E75' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${statusFilter === s ? 'rgba(29,158,117,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              {s}
            </button>
          ))}
        </div>

        {/* Items */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <p className="text-lg mb-2">No missed demand logged yet</p>
            <p className="text-sm">Log items customers ask for that you don't stock — Aria will analyse the opportunity.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="rounded-xl p-4 border"
                style={{ background: STATUS_COLORS[item.status] ?? 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm">{item.product_name}</span>
                      {item.product_category && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                          {item.product_category}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                        style={{ background: STATUS_COLORS[item.status], color: STATUS_TEXT[item.status] }}>
                        {item.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <span>Asked {item.times_requested}× · {item.estimated_quantity_wanted} units wanted</span>
                      {item.approximate_price_point_cents && (
                        <span>~A${(item.approximate_price_point_cents / 100).toFixed(2)}</span>
                      )}
                      <span>{timeAgo(item.last_requested_at)}</span>
                    </div>
                    {item.customer_note && (
                      <p className="mt-1.5 text-xs italic" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        "{item.customer_note}"
                      </p>
                    )}
                    {item.aria_analysis && (
                      <div className="mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(29,158,117,0.08)', borderLeft: '2px solid #1D9E75' }}>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{item.aria_analysis}</p>
                        {item.estimated_monthly_revenue_cents && (
                          <p className="text-xs mt-1 font-medium" style={{ color: '#1D9E75' }}>
                            Estimated A${(item.estimated_monthly_revenue_cents / 100).toFixed(0)}/month opportunity
                            {item.aria_confidence && ` · ${item.aria_confidence} confidence`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.status === 'pending' && (
                      <button
                        onClick={() => analyzeItem(item)}
                        disabled={analyzing === item.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                        style={{ background: 'rgba(29,158,117,0.2)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.3)' }}>
                        {analyzing === item.id ? 'Analysing…' : 'Aria Analyse'}
                      </button>
                    )}
                    {item.status === 'analysed' && (
                      <>
                        <button onClick={() => updateStatus(item.id, 'accepted')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                          Accept
                        </button>
                        <button onClick={() => updateStatus(item.id, 'rejected')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                          Reject
                        </button>
                      </>
                    )}
                    {item.status === 'accepted' && (
                      <button onClick={() => updateStatus(item.id, 'stocked')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'rgba(29,158,117,0.2)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.3)' }}>
                        Mark Stocked
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: '#1a1a25', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-white font-semibold mb-4">Log Missed Sale</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Product name *</label>
                <input
                  value={addForm.product_name}
                  onChange={e => setAddForm(f => ({ ...f, product_name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="e.g. Oat Milk 1L" />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Category</label>
                <input
                  value={addForm.product_category}
                  onChange={e => setAddForm(f => ({ ...f, product_category: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="e.g. Dairy, Beer & Cider" />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Qty wanted</label>
                <input
                  type="number" min="1"
                  value={addForm.estimated_quantity_wanted}
                  onChange={e => setAddForm(f => ({ ...f, estimated_quantity_wanted: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Customer note</label>
                <input
                  value={addForm.customer_note}
                  onChange={e => setAddForm(f => ({ ...f, customer_note: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="What the customer said (optional)" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                Cancel
              </button>
              <button onClick={addMissedItem} disabled={adding || !addForm.product_name.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: '#1D9E75', color: '#fff' }}>
                {adding ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
