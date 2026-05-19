'use client'
import { useState, useEffect, useCallback } from 'react'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: '#F0F4F0', muted: 'var(--text-secondary,#A8B5A8)', green: '#7FB897', darkGreen: '#2D5240', red: '#ef4444', amber: '#f59e0b', border: 'rgba(127,184,151,0.15)' }
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const STATUS_COLOR: Record<string, string> = { confirmed: C.green, pending: C.amber, cancelled: C.red, no_show: '#6b7280', completed: C.muted }

interface Service { id: string; name: string; duration_minutes: number; price: number | null; max_party_size: number; color: string }
interface Booking { id: string; customer_name: string; customer_phone: string | null; customer_email: string | null; booking_date: string; booking_time: string | null; party_size: number; duration_minutes: number; status: string; notes: string | null; aria_notes: string | null; booking_services: { name: string; color: string; duration_minutes: number } | null }

function dateStr(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(s: string) { return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) }
function fmtTime(t: string | null) { if (!t) return ''; const [h, m] = t.split(':'); const hour = parseInt(h); return `${hour > 12 ? hour - 12 : hour || 12}:${m}${hour >= 12 ? 'pm' : 'am'}` }

export default function BookingsPage() {
  const [bid, setBid]             = useState('')
  const [bookings, setBookings]   = useState<Booking[]>([])
  const [services, setServices]   = useState<Service[]>([])
  const [selectedDate, setSelectedDate] = useState(dateStr(new Date()))
  const [tab, setTab]             = useState<'bookings' | 'services'>('bookings')
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [ariaInsight, setAriaInsight] = useState('')
  const [checkingAria, setCheckingAria] = useState(false)
  const [form, setForm]           = useState({ customer_name: '', customer_email: '', customer_phone: '', booking_date: dateStr(new Date()), booking_time: '12:00', party_size: 2, service_id: '', notes: '' })
  const [svcForm, setSvcForm]     = useState({ name: '', duration_minutes: 60, price: '', max_party_size: 20, description: '', color: '#7FB897' })
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async (businessId: string) => {
    const [bkRes, svcRes] = await Promise.all([
      fetch(`/api/bookings?business_id=${businessId}`),
      fetch('/api/bookings/services'),
    ])
    const bkData = await bkRes.json().catch(() => ({}))
    const svcData = await svcRes.json().catch(() => ({}))
    setBookings(bkData.bookings ?? [])
    setServices(svcData.services ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then((d: Record<string,unknown>) => {
      if (d.business_id) { setBid(d.business_id as string); load(d.business_id as string) }
      else setLoading(false)
    }).catch(() => setLoading(false))
  }, [load])

  async function addBooking() {
    if (!form.customer_name || !form.booking_date) return
    setSaving(true)
    const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, business_id: bid, party_size: Number(form.party_size) }) })
    const d = await res.json() as { booking?: Booking }
    if (d.booking) { setBookings(prev => [d.booking!, ...prev]); setShowAdd(false) }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string, extra?: Record<string, unknown>) {
    const res = await fetch('/api/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, business_id: bid, status, ...extra }) })
    const d = await res.json() as { booking?: Booking }
    if (d.booking) setBookings(prev => prev.map(b => b.id === id ? { ...b, ...d.booking } : b))
  }

  async function addService() {
    if (!svcForm.name) return
    setSaving(true)
    const res = await fetch('/api/bookings/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...svcForm, price: parseFloat(svcForm.price) || null }) })
    const d = await res.json() as { service?: Service }
    if (d.service) { setServices(prev => [...prev, d.service!]); setSvcForm({ name: '', duration_minutes: 60, price: '', max_party_size: 20, description: '', color: '#7FB897' }) }
    setSaving(false)
  }

  async function runAria() {
    setCheckingAria(true)
    const res = await fetch('/api/bookings/aria-suggest', { method: 'POST' })
    const d = await res.json() as { insight?: string }
    setAriaInsight(d.insight ?? '')
    setCheckingAria(false)
  }

  const today = new Date()
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() - today.getDay() + 1 + i); return dateStr(d) })
  const dayBookings = bookings.filter(b => b.booking_date === selectedDate)
  const iStyle: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 14, boxSizing: 'border-box' }

  if (loading) return <div style={{ padding: 32, color: C.muted }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Bookings</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['bookings','services'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t ? C.darkGreen : 'transparent', color: tab === t ? C.green : C.muted }}>
                {t === 'bookings' ? 'Bookings' : 'Services'}
              </button>
            ))}
            <button onClick={() => setShowAdd(true)} style={{ padding: '7px 16px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>+ Add booking</button>
          </div>
        </div>

        {tab === 'bookings' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {weekDays.map(d => {
                const count = bookings.filter(b => b.booking_date === d).length
                const isSelected = d === selectedDate
                const isToday = d === dateStr(new Date())
                const dayDate = new Date(d + 'T00:00:00')
                return (
                  <button key={d} onClick={() => setSelectedDate(d)} style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: `1px solid ${isSelected ? C.green : C.border}`, background: isSelected ? C.darkGreen : 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: isSelected ? C.green : C.muted, fontWeight: 600 }}>{DAY_NAMES[dayDate.getDay()]}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: isToday ? C.green : C.text }}>{dayDate.getDate()}</span>
                    {count > 0 && <span style={{ fontSize: 10, background: C.green + '33', color: C.green, borderRadius: 10, padding: '1px 6px' }}>{count}</span>}
                  </button>
                )
              })}
            </div>

            <p style={{ fontSize: 14, color: C.muted, marginBottom: 12 }}>{fmtDate(selectedDate)} · {dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''}</p>

            {dayBookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                No bookings for this day.{' '}
                <button onClick={() => setShowAdd(true)} style={{ color: C.green, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}>Add one?</button>
              </div>
            ) : (
              dayBookings.sort((a, b) => (a.booking_time || '').localeCompare(b.booking_time || '')).map(b => (
                <div key={b.id} style={{ background: C.card, borderRadius: 14, padding: '16px 20px', marginBottom: 10, borderLeft: `4px solid ${b.booking_services?.color || STATUS_COLOR[b.status] || C.muted}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{b.customer_name}</span>
                        {b.booking_time && <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{fmtTime(b.booking_time)}</span>}
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: (STATUS_COLOR[b.status] || C.muted) + '22', color: STATUS_COLOR[b.status] || C.muted, fontWeight: 700 }}>{b.status}</span>
                      </div>
                      <div style={{ fontSize: 13, color: C.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {b.booking_services?.name && <span>📋 {b.booking_services.name}</span>}
                        <span>👥 {b.party_size} {b.party_size === 1 ? 'guest' : 'guests'}</span>
                        {b.customer_phone && <span>📞 {b.customer_phone}</span>}
                        {b.customer_email && <span>✉ {b.customer_email}</span>}
                      </div>
                      {b.notes && <p style={{ fontSize: 13, color: C.muted, marginTop: 6, fontStyle: 'italic' }}>&ldquo;{b.notes}&rdquo;</p>}
                      {b.aria_notes && <p style={{ fontSize: 12, color: C.green, marginTop: 6 }}>✦ {b.aria_notes}</p>}
                    </div>
                    {b.status === 'confirmed' && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => updateStatus(b.id, 'completed')} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer' }}>Done</button>
                        <button onClick={() => updateStatus(b.id, 'no_show')} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, cursor: 'pointer' }}>No-show</button>
                        <button onClick={() => { const r = prompt('Cancellation reason (optional):'); updateStatus(b.id, 'cancelled', { cancellation_reason: r || null }) }} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.1)', color: C.red, border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            <div style={{ marginTop: 24 }}>
              <button onClick={runAria} disabled={checkingAria} style={{ fontSize: 13, color: C.green, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>
                {checkingAria ? 'Analysing…' : '✦ Aria booking insights'}
              </button>
              {ariaInsight && (
                <div style={{ marginTop: 12, background: 'rgba(127,184,151,0.08)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', fontSize: 14 }}>
                  <span style={{ color: C.green, fontWeight: 600 }}>✦ Aria  </span>{ariaInsight}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'services' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 24 }}>
              {services.map(s => (
                <div key={s.id} style={{ background: C.card, borderRadius: 14, padding: 18, borderLeft: `4px solid ${s.color}` }}>
                  <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.name}</p>
                  <p style={{ fontSize: 13, color: C.muted }}>{s.duration_minutes} min{s.price ? ` · $${s.price}` : ''} · up to {s.max_party_size} guests</p>
                </div>
              ))}
            </div>
            <div style={{ background: C.card, borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Add service</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {([
                  { label: 'Service name', key: 'name', type: 'text' },
                  { label: 'Price ($, optional)', key: 'price', type: 'number' },
                  { label: 'Duration (mins)', key: 'duration_minutes', type: 'number' },
                  { label: 'Max party size', key: 'max_party_size', type: 'number' },
                ] as const).map(({ label, key, type }) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>{label}</label>
                    <input type={type} style={iStyle} value={String(svcForm[key])} onChange={e => setSvcForm(s => ({ ...s, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <button onClick={addService} disabled={saving || !svcForm.name} style={{ marginTop: 14, background: C.darkGreen, color: C.green, border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                {saving ? 'Saving…' : 'Add service'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: C.card, borderRadius: 18, padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>New booking</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            {([
              { label: 'Customer name *', key: 'customer_name', type: 'text' },
              { label: 'Phone', key: 'customer_phone', type: 'tel' },
              { label: 'Email', key: 'customer_email', type: 'email' },
              { label: 'Date *', key: 'booking_date', type: 'date' },
              { label: 'Time', key: 'booking_time', type: 'time' },
              { label: 'Party size', key: 'party_size', type: 'number' },
            ] as const).map(({ label, key, type }) => (
              <div key={key}>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>{label}</label>
                <input type={type} style={iStyle} value={String(form[key])} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            {services.length > 0 && (
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Service (optional)</label>
                <select style={{ ...iStyle }} value={form.service_id} onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))}>
                  <option value="">No specific service</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min{s.price ? ` · $${s.price}` : ''})</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea rows={2} style={{ ...iStyle, resize: 'vertical' } as React.CSSProperties} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addBooking} disabled={saving || !form.customer_name} style={{ flex: 1, background: C.darkGreen, color: C.green, border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Confirm booking'}
              </button>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 0', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
