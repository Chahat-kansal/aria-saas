'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import Link from 'next/link';

interface Booking { id: string; customer_name: string | null; service: string | null; booking_date: string | null; amount: number | null; status: string | null; notes: string | null; phone: string | null; duration_minutes: number | null; }

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  confirmed:  { bg: 'rgba(29,158,117,0.15)',  color: '#1D9E75' },
  in_progress:{ bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
  completed:  { bg: 'rgba(255,255,255,0.06)', color: '#9ca3af' },
  cancelled:  { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
  'no-show':  { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
};

const STATUSES = ['confirmed','in_progress','completed','cancelled','no-show'];
const DURATIONS = [30, 60, 90, 120];

function isToday(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr).toDateString() === new Date().toDateString();
}
function isUpcoming(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) >= new Date();
}

export default function BookingsPage() {
  const { business } = useBusinessContext();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: '', service: '', booking_date: '', amount: '', notes: '', phone: '', duration_minutes: '60',
  });

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const res = await fetch(`/api/bookings?business_id=${business.id}`).then(r => r.json()).catch(() => ({ bookings: [] }));
    setBookings(res.bookings ?? res.data ?? []);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  async function createBooking() {
    if (!business?.id || !form.customer_name || !form.booking_date) return;
    setSaving(true);
    await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id,
        customer_name: form.customer_name,
        service: form.service || null,
        booking_date: form.booking_date,
        amount: form.amount ? parseFloat(form.amount) : null,
        notes: form.notes || null,
        phone: form.phone || null,
        duration_minutes: parseInt(form.duration_minutes),
        status: 'confirmed',
      }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ customer_name: '', service: '', booking_date: '', amount: '', notes: '', phone: '', duration_minutes: '60' });
    load();
  }

  async function updateStatus(id: string, status: string) {
    if (!business?.id) return;
    setUpdatingId(id);
    await fetch(`/api/bookings?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, status }),
    });
    setUpdatingId(null);
    load();
  }

  const todayBookings = bookings.filter(b => isToday(b.booking_date));
  const upcoming = bookings.filter(b => !isToday(b.booking_date) && isUpcoming(b.booking_date));
  const past = bookings.filter(b => !isUpcoming(b.booking_date));
  const totalRevenue = bookings.filter(b => b.status === 'completed').reduce((s, b) => s + (b.amount ?? 0), 0);

  const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]';

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-[rgba(255,255,255,0.06)] rounded-xl w-48" />
        <div className="grid grid-cols-3 gap-4"><div className="h-24 bg-[rgba(255,255,255,0.04)] rounded-xl col-span-3" /></div>
        <div className="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Bookings</h1>
          <p style={{ color: '#6b7280' }}>All appointments and jobs</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>
          + New booking
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Today', value: todayBookings.length, color: todayBookings.length > 0 ? '#1D9E75' : '#fff' },
          { label: 'Upcoming', value: upcoming.length, color: '#fff' },
          { label: 'Total bookings', value: bookings.length, color: '#fff' },
          { label: 'Completed revenue', value: `A$${totalRevenue.toLocaleString()}`, color: '#1D9E75' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{s.label}</p>
            <p className="text-xl font-semibold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Today */}
      {todayBookings.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-white mb-3">Today's schedule</h2>
          <div className="space-y-2">
            {todayBookings.map(b => {
              const ss = STATUS_STYLES[b.status ?? 'confirmed'] ?? STATUS_STYLES.confirmed;
              return (
                <div key={b.id} className="rounded-xl p-4 flex items-center gap-4" style={{ background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.15)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{b.customer_name ?? 'No name'}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={ss}>{b.status ?? 'confirmed'}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                      {b.service ?? 'No service'} · {b.booking_date ? new Date(b.booking_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      {b.duration_minutes ? ` · ${b.duration_minutes}min` : ''}
                    </p>
                  </div>
                  {b.amount && <p className="text-sm font-medium shrink-0" style={{ color: '#1D9E75' }}>A${b.amount}</p>}
                  <select value={b.status ?? 'confirmed'} onChange={e => updateStatus(b.id, e.target.value)}
                    disabled={updatingId === b.id}
                    className="text-xs rounded-lg px-2 py-1.5 outline-none disabled:opacity-40"
                    style={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}>
                    {STATUSES.map(s => <option key={s} value={s} style={{ background: '#1a1a2e' }}>{s.replace('-', ' ')}</option>)}
                  </select>
                  <Link href={`/dashboard/quote-builder?customer=${encodeURIComponent(b.customer_name ?? '')}&service=${encodeURIComponent(b.service ?? '')}`}
                    className="text-xs px-2 py-1.5 rounded-lg shrink-0"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                    Quote
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All bookings table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-4" style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="font-medium text-white">All bookings</h2>
        </div>
        {bookings.length === 0 ? (
          <div className="px-5 py-12 text-center" style={{ background: '#0d0d14' }}>
            <div className="text-3xl mb-3">📅</div>
            <p className="font-semibold text-white mb-1">No bookings yet</p>
            <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Create your first booking to start tracking your schedule.</p>
            <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>+ New booking</button>
          </div>
        ) : (
          <table className="w-full text-sm" style={{ background: '#0d0d14' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Customer', 'Service', 'Date & Time', 'Amount', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...upcoming, ...todayBookings, ...past].map(b => {
                const ss = STATUS_STYLES[b.status ?? 'confirmed'] ?? STATUS_STYLES.confirmed;
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-5 py-3 text-white">{b.customer_name ?? '—'}</td>
                    <td className="px-5 py-3" style={{ color: '#9ca3af' }}>{b.service ?? '—'}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: '#9ca3af' }}>
                      {b.booking_date ? new Date(b.booking_date).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className="px-5 py-3 text-white">{b.amount ? `A$${b.amount}` : '—'}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs" style={ss}>{b.status ?? 'confirmed'}</span>
                    </td>
                    <td className="px-5 py-3">
                      <select value={b.status ?? 'confirmed'} onChange={e => updateStatus(b.id, e.target.value)}
                        disabled={updatingId === b.id}
                        className="text-xs rounded-lg px-2 py-1 outline-none disabled:opacity-40"
                        style={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}>
                        {STATUSES.map(s => <option key={s} value={s} style={{ background: '#1a1a2e' }}>{s.replace('-', ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* New booking modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131a] rounded-2xl p-6 w-full max-w-md border border-[rgba(255,255,255,0.1)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">New booking</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Customer name *</label>
                <input value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} className={inputCls} placeholder="e.g. Jane Smith" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Service / job type</label>
                <input value={form.service} onChange={e => setForm(p => ({ ...p, service: e.target.value }))} className={inputCls} placeholder="e.g. Haircut & colour" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Date & time *</label>
                  <input type="datetime-local" value={form.booking_date} onChange={e => setForm(p => ({ ...p, booking_date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Duration</label>
                  <select value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: e.target.value }))} className={inputCls}>
                    {DURATIONS.map(d => <option key={d} value={d} style={{ background: '#1a1a2e' }}>{d} min</option>)}
                    <option value="custom" style={{ background: '#1a1a2e' }}>Custom</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Amount (A$)</label>
                  <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className={inputCls} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Phone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="04xx xxx xxx" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputCls + ' resize-none'} placeholder="Any notes…" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={createBooking} disabled={saving || !form.customer_name || !form.booking_date}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                {saving ? 'Creating…' : 'Create booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
