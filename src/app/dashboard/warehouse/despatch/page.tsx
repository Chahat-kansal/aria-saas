'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Despatch {
  id: string;
  despatch_number: string;
  despatch_type: 'outbound' | 'transfer' | 'return';
  recipient_name: string | null;
  carrier: string | null;
  tracking_number: string | null;
  status: 'pending' | 'packed' | 'despatched' | 'delivered' | 'failed';
  notes: string | null;
  created_at: string;
}

interface DespatchForm {
  recipient_name: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  carrier: string;
  tracking_number: string;
  despatch_type: 'outbound' | 'transfer' | 'return';
  notes: string;
}

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-[rgba(255,255,255,0.06)] text-gray-400',
  packed: 'bg-blue-900/30 text-blue-400',
  despatched: 'bg-green-900/30 text-green-400',
  delivered: 'bg-emerald-900/30 text-emerald-400',
  failed: 'bg-red-900/30 text-red-400',
};

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
const CARRIERS = ['Australia Post', 'Startrack', 'TNT', 'DHL', 'Couriers Please', 'Other'];

const BLANK_FORM: DespatchForm = {
  recipient_name: '', address: '', city: '', state: 'NSW', postcode: '',
  carrier: 'Australia Post', tracking_number: '', despatch_type: 'outbound', notes: '',
};

function nextStatus(current: Despatch['status']): Despatch['status'] | null {
  if (current === 'pending' || current === 'packed') return 'despatched';
  if (current === 'despatched') return 'delivered';
  return null;
}

function nextLabel(current: Despatch['status']): string {
  if (current === 'pending' || current === 'packed') return 'Mark despatched';
  if (current === 'despatched') return 'Mark delivered';
  return '';
}

export default function DespatchPage() {
  const { business } = useBusinessContext();
  const [despatches, setDespatches] = useState<Despatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<DespatchForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchDespatches = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/despatch?business_id=${business.id}`);
      const data = await res.json();
      setDespatches(data.despatches ?? []);
    } catch {
      setDespatches([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchDespatches(); }, [fetchDespatches]);

  const pendingCount = despatches.filter(d => d.status === 'pending' || d.status === 'packed').length;
  const despatchedCount = despatches.filter(d => d.status === 'despatched').length;
  const deliveredCount = despatches.filter(d => d.status === 'delivered').length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id) return;
    setSaving(true);
    try {
      await fetch('/api/warehouse/despatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, ...form }),
      });
      setForm(BLANK_FORM);
      setShowAdd(false);
      fetchDespatches();
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusUpdate(d: Despatch) {
    const next = nextStatus(d.status);
    if (!next) return;
    setActionId(d.id);
    try {
      await fetch(`/api/warehouse/despatch/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      fetchDespatches();
    } finally {
      setActionId(null);
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl text-sm outline-none text-white';
  const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Despatch</h1>
          <p style={{ color: '#6b7280' }}>Manage outbound shipments and track delivery status</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: '#1D9E75' }}
        >
          {showAdd ? 'Cancel' : '+ New Despatch'}
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending / Packed', value: pendingCount, color: '#9ca3af' },
          { label: 'Despatched', value: despatchedCount, color: '#1D9E75' },
          { label: 'Delivered', value: deliveredCount, color: '#34d399' },
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
          <h2 className="text-base font-semibold text-white mb-4">New Despatch</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Recipient Name</label>
              <input value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} placeholder="Full name" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Despatch Type</label>
              <select value={form.despatch_type} onChange={e => setForm(f => ({ ...f, despatch_type: e.target.value as DespatchForm['despatch_type'] }))} className={inputCls} style={inputStyle}>
                <option value="outbound">Outbound</option>
                <option value="transfer">Transfer</option>
                <option value="return">Return</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1.5">Address</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className={inputCls} style={inputStyle} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">State</label>
                <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className={inputCls} style={inputStyle}>
                  {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Postcode</label>
                <input value={form.postcode} onChange={e => setForm(f => ({ ...f, postcode: e.target.value }))} placeholder="2000" className={inputCls} style={inputStyle} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Carrier</label>
              <select value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} className={inputCls} style={inputStyle}>
                {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Tracking Number</label>
              <input value={form.tracking_number} onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))} placeholder="Optional tracking #" className={inputCls} style={inputStyle} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1.5">Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
              {saving ? 'Saving…' : 'Create Despatch'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Despatch #', 'Type', 'Recipient', 'Carrier', 'Status', 'Tracking', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d0d14' }}>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>Loading…</td></tr>
            ) : despatches.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No despatches yet. Create one above.</td></tr>
            ) : despatches.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-4 py-3 text-white font-medium">{d.despatch_number}</td>
                <td className="px-4 py-3 capitalize" style={{ color: '#9ca3af' }}>{d.despatch_type}</td>
                <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{d.recipient_name ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{d.carrier ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[d.status] ?? STATUS_PILL.pending}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-mono" style={{ color: '#6b7280' }}>{d.tracking_number ?? '—'}</td>
                <td className="px-4 py-3">
                  {nextStatus(d.status) && (
                    <button
                      onClick={() => handleStatusUpdate(d)}
                      disabled={actionId === d.id}
                      className="text-xs px-2.5 py-1 rounded-lg whitespace-nowrap disabled:opacity-40"
                      style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}
                    >
                      {nextLabel(d.status)}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
