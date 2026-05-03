'use client';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';
import { useState, useEffect } from 'react';

interface Customer {
  id: string; name: string; email: string | null; phone: string | null;
  loyalty_points: number; created_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch('/api/pos/customers')
      .then(r => r.json())
      .then(d => { setCustomers(d.customers || []); setLoading(false); });
  };
  useEffect(load, []);

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await fetch('/api/pos/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, email: form.email || null, phone: form.phone || null }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.customer) {
      setCustomers(cs => [d.customer, ...cs]);
      setShowAdd(false);
      setForm({ name: '', email: '', phone: '' });
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <POSAriaInsight page="pos/customers" />
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
            <p className="text-xs text-gray-500 mt-0.5">{customers.length} registered</p>
          </div>
          <button onClick={() => setShowAdd(s => !s)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
            + Add customer
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addCustomer}
            className="bg-white rounded-2xl p-5 mb-5 space-y-4 border border-orange-100 shadow-sm">
            <h3 className="text-sm font-medium text-gray-900">New customer</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  placeholder="Full name" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  placeholder="Optional" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                  placeholder="Optional" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
                {saving ? 'Saving…' : 'Add customer'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone…"
            className="w-full max-w-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent" />
        </div>

        <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Customer', 'Email', 'Phone', 'Loyalty pts', 'Since'].map(h => (
                  <th key={h} className="text-left text-[10px] text-gray-400 uppercase tracking-widest px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-xs text-gray-400">Loading…</td></tr>
              ) : !filtered.length ? (
                <tr><td colSpan={5} className="text-center py-12 text-xs text-gray-400">
                  {!customers.length ? 'No customers yet' : 'No customers match'}
                </td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                          style={{ background: 'rgba(249,115,22,.12)', color: '#ea580c' }}>
                          {c.name[0].toUpperCase()}
                        </div>
                        <span className="text-xs text-gray-900 font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{c.email || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{c.phone || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium" style={{ color: c.loyalty_points > 0 ? '#ea580c' : '#9ca3af' }}>
                        {c.loyalty_points}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-gray-400">
                        {new Date(c.created_at).toLocaleDateString('en-AU')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
