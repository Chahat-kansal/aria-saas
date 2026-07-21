'use client'
import { useState, useEffect, useCallback } from 'react'
import { AriaSays } from '@/components/dashboard/AriaSays'
import { BookingCard } from './BookingCard'
import { FloorPlan } from '@/components/pos/FloorPlan'
import type { Service, Booking, Availability, BusinessHours } from './types'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: '#F0F4F0', muted: 'var(--text-secondary,#A8B5A8)', green: '#7FB897', darkGreen: '#2D5240', red: '#ef4444', amber: '#f59e0b', blue: '#60a5fa', border: 'rgba(127,184,151,0.15)' }
const STATUS_COLOR: Record<string, string> = { confirmed: C.green, pending: C.amber, cancelled: C.red, no_show: '#6b7280', completed: C.muted }
const STATUS_LABELS = ['confirmed', 'pending', 'cancelled', 'no_show', 'completed']
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dateStr(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(s: string) { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) }
function fmtTime(t: string | null) { if (!t) return '—'; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m}${hr >= 12 ? 'pm' : 'am'}` }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function weekStart(d: Date) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r }
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }

const iStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13, width: '100%', boxSizing: 'border-box' }
const btnPrimary: React.CSSProperties = { background: C.darkGreen, color: C.green, border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 36 }

export default function BookingsPage() {
  const [bid, setBid] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [tab, setTab] = useState<'calendar' | 'list' | 'services' | 'availability' | 'tables'>('calendar')
  const [calView, setCalView] = useState<'week' | 'month'>('week')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedDate, setSelectedDate] = useState(dateStr(new Date()))
  const [weekOf, setWeekOf] = useState(() => weekStart(new Date()))
  const [monthOf, setMonthOf] = useState(() => monthStart(new Date()))
  const [statusFilter, setStatusFilter] = useState('all')
  const [sending, setSending] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ customer_name: '', customer_email: '', customer_phone: '', booking_date: dateStr(new Date()), booking_time: '12:00', party_size: 2, service_id: '', notes: '' })
  const [svcForm, setSvcForm] = useState({ name: '', duration_minutes: 60, price: '', max_party_size: 20, description: '', color: '#7FB897' })
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [savingService, setSavingService] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [insight, setInsight] = useState<string | null>(null)
  const [insightDismissed, setInsightDismissed] = useState(false)
  const [bizSlug, setBizSlug] = useState('')
  const [slugInput, setSlugInput] = useState('')
  const [slugSaving, setSlugSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [availSaving, setAvailSaving] = useState(false)
  const [bookingsEnabled, setBookingsEnabled] = useState(false)
  const [bookingsToggling, setBookingsToggling] = useState(false)
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([])
  const [tableMode, setTableMode] = useState<'auto' | 'area' | 'table'>('auto')
  const [tableModeSaving, setTableModeSaving] = useState(false)

  const load = useCallback(async (businessId: string) => {
    const [bkRes, svcRes] = await Promise.all([
      fetch('/api/bookings?business_id=' + businessId),
      fetch('/api/bookings/services'),
    ])
    const bk = await bkRes.json().catch(() => ({}))
    const sv = await svcRes.json().catch(() => ({}))
    setBookings((bk.bookings ?? []).map((b: Booking) => ({ ...b, booking_date: b.booking_date ? b.booking_date.slice(0, 10) : b.booking_date })))
    setServices(sv.services ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then((d: Record<string, unknown>) => {
      if (d.business_id) {
        const businessId = d.business_id as string
        setBid(businessId)
        load(businessId)
        loadAvailability(businessId)
        fetch('/api/aria/booking-insights').then(r => r.json()).then(id => { if (id.insight) setInsight(id.insight) }).catch(() => {})
        fetch('/api/pos/business').then(r => r.json()).then(bd => {
          if (bd.business?.booking_link_slug) { setBizSlug(bd.business.booking_link_slug); setSlugInput(bd.business.booking_link_slug) }
          setBookingsEnabled(!!bd.business?.bookings_enabled)
          setBusinessHours(bd.business_hours ?? [])
          setTableMode(bd.business?.booking_table_mode ?? 'auto')
        }).catch(() => {})
      } else setLoading(false)
    }).catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  // BOOKINGS-OWNER-CONTROL-1 — when no availability rows exist yet (new business, or bookings
  // never configured), derive a sensible display default from business_hours instead of a
  // hardcoded Mon-Fri 9-5 guess. This is display-only; the real seed happens server-side in
  // toggleBookings() the moment bookings is switched on, so this never silently loses data.
  async function loadAvailability(businessId?: string) {
    const targetBid = businessId || bid
    if (!targetBid) return
    const res = await fetch('/api/bookings/availability-settings?business_id=' + targetBid).catch(() => null)
    const d = await res?.json().catch(() => ({}))
    if (d?.availability?.length) { setAvailability(d.availability); return }

    const hoursRes = await fetch('/api/pos/business').then(r => r.json()).catch(() => null)
    const hours: BusinessHours[] = hoursRes?.business_hours ?? businessHours
    const byDay = new Map(hours.map(h => [h.day_of_week, h]))
    setAvailability(Array.from({ length: 7 }, (_, day_of_week) => {
      const h = byDay.get(day_of_week)
      return {
        day_of_week,
        start_time: h?.open_time ?? '09:00',
        end_time: h?.close_time ?? '17:00',
        is_available: h ? !h.is_closed : (day_of_week >= 1 && day_of_week <= 5),
        buffer_minutes: 15,
        max_bookings_per_day: null,
      }
    }))
  }

  async function toggleBookings(next: boolean) {
    setBookingsToggling(true)
    const res = await fetch('/api/pos/business', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookings_enabled: next }) }).catch(() => null)
    const d = await res?.json().catch(() => ({}))
    if (d?.business) {
      setBookingsEnabled(!!d.business.bookings_enabled)
      // Onboarding seed may have just created a default service + availability — reload both.
      if (next) { await load(bid); await loadAvailability(bid) }
    }
    setBookingsToggling(false)
  }

  async function saveTableMode(mode: 'auto' | 'area' | 'table') {
    setTableModeSaving(true)
    const res = await fetch('/api/pos/business', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_table_mode: mode }) }).catch(() => null)
    const d = await res?.json().catch(() => ({}))
    if (d?.business) setTableMode(d.business.booking_table_mode ?? mode)
    setTableModeSaving(false)
  }

  async function addBooking() {
    if (!form.customer_name || !form.booking_date) return
    setSaving(true)
    const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, business_id: bid, party_size: Number(form.party_size), service_id: form.service_id || null }) })
    const d = await res.json()
    if (d.booking) { setBookings(p => [{ ...d.booking, booking_date: d.booking.booking_date?.slice(0, 10) }, ...p]); setShowAdd(false); setForm({ customer_name: '', customer_email: '', customer_phone: '', booking_date: dateStr(new Date()), booking_time: '12:00', party_size: 2, service_id: '', notes: '' }) }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch('/api/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, business_id: bid, status }) })
    setBookings(p => p.map(b => b.id === id ? { ...b, status } : b))
    if (selectedBooking?.id === id) setSelectedBooking(p => p ? { ...p, status } : p)
  }

  async function sendReminder(booking: Booking) {
    if (!booking.customer_phone) return alert('No phone number for this customer.')
    setSending(p => ({ ...p, [booking.id]: true }))
    const res = await fetch('/api/bookings/remind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: booking.id, business_id: bid }) })
    const d = await res.json()
    if (d.ok) setBookings(p => p.map(b => b.id === booking.id ? { ...b, reminder_sent_at: new Date().toISOString() } : b))
    else alert(d.error || 'Could not send reminder.')
    setSending(p => ({ ...p, [booking.id]: false }))
  }

  async function saveSlug() {
    if (!slugInput.trim()) return
    setSlugSaving(true)
    const res = await fetch('/api/pos/business', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_link_slug: slugInput }) })
    const d = await res.json()
    if (d.business) setBizSlug(slugInput)
    setSlugSaving(false)
  }

  function resetSvcForm() {
    setEditingServiceId(null)
    setSvcForm({ name: '', duration_minutes: 60, price: '', max_party_size: 20, description: '', color: '#7FB897' })
  }

  function startEditService(s: Service) {
    setEditingServiceId(s.id)
    setSvcForm({ name: s.name, duration_minutes: s.duration_minutes, price: s.price != null ? String(s.price) : '', max_party_size: s.max_party_size, description: s.description ?? '', color: s.color })
  }

  async function saveService() {
    if (!svcForm.name.trim()) return
    setSavingService(true)
    const payload = { ...svcForm, price: parseFloat(svcForm.price) || null }
    if (editingServiceId) {
      const res = await fetch('/api/bookings/services', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingServiceId, ...payload }) })
      const d = await res.json()
      if (d.service) { setServices(p => p.map(s => s.id === editingServiceId ? d.service : s)); resetSvcForm() }
    } else {
      const res = await fetch('/api/bookings/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, business_id: bid }) })
      const d = await res.json()
      if (d.service) { setServices(p => [...p, d.service]); resetSvcForm() }
    }
    setSavingService(false)
  }

  async function archiveService(id: string) {
    setArchivingId(id)
    const res = await fetch('/api/bookings/services', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: false }) })
    const d = await res.json()
    if (d.service) setServices(p => p.filter(s => s.id !== id))
    setArchivingId(null)
  }

  async function saveAvailability() {
    setAvailSaving(true)
    for (const a of availability) {
      await fetch('/api/bookings/availability-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, ...a }) }).catch(() => {})
    }
    setAvailSaving(false)
  }

  function copyLink() {
    if (!bizSlug) return
    navigator.clipboard.writeText(window.location.origin + '/book/' + bizSlug).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const today = dateStr(new Date())
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i))
  const filteredBookings = bookings.filter(b => statusFilter === 'all' || b.status === statusFilter)
  const todayBookings = bookings.filter(b => b.booking_date === today && b.status !== 'cancelled')
  const upcomingCount = bookings.filter(b => b.booking_date >= today && b.status === 'confirmed').length
  const needReminder = bookings.filter(b => b.status === 'confirmed' && !b.reminder_sent_at && b.booking_date === dateStr(addDays(new Date(), 1)))

  // Month view helpers
  const monthDays = (() => {
    const start = monthStart(monthOf)
    const offset = (start.getDay() + 6) % 7
    const days: (Date | null)[] = Array(offset).fill(null)
    const daysInMonth = new Date(monthOf.getFullYear(), monthOf.getMonth() + 1, 0).getDate()
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(monthOf.getFullYear(), monthOf.getMonth(), i))
    while (days.length % 7 !== 0) days.push(null)
    return days
  })()

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: C.text, fontFamily: 'Inter,sans-serif' }}>
      <AriaSays businessId={bid || null} page="bookings" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Bookings</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Manage reservations, services, and reminders</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {bizSlug && (
            <button onClick={copyLink} style={{ ...btnPrimary, background: copied ? 'rgba(127,184,151,0.2)' : 'transparent', color: copied ? C.green : C.muted, border: '1px solid ' + C.border }}>
              {copied ? '✓ Copied!' : '🔗 Copy booking link'}
            </button>
          )}
          <button onClick={() => setShowAdd(p => !p)} style={btnPrimary}>+ New booking</button>
        </div>
      </div>

      {/* Bookings on/off switch */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: C.card, borderRadius: 12, padding: '12px 16px', marginBottom: 12, border: '1px solid ' + C.border }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Online bookings</p>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{bookingsEnabled ? 'Customers can book online at your public link.' : 'Your public booking page is currently switched off.'}</p>
        </div>
        <button
          onClick={() => toggleBookings(!bookingsEnabled)}
          disabled={bookingsToggling}
          style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: bookingsEnabled ? C.green : 'rgba(255,255,255,0.15)', opacity: bookingsToggling ? 0.6 : 1, flexShrink: 0 }}
        >
          <span style={{ position: 'absolute', top: 2, left: bookingsEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
      </div>

      {/* Warning: enabled but nothing to actually book */}
      {bookingsEnabled && availability.length > 0 && availability.every(a => !a.is_available) && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.red }}>⚠️ Online bookings are on, but no day has availability configured</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Customers visiting your booking link will see no time slots. Open the Availability tab and turn on at least one day.</p>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: "Today's bookings", value: todayBookings.length, color: C.green },
          { label: 'Upcoming confirmed', value: upcomingCount, color: C.blue },
          { label: 'Need reminder (tomorrow)', value: needReminder.length, color: needReminder.length > 0 ? C.amber : C.muted },
          { label: 'Services offered', value: services.length, color: C.muted },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: C.card, borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces,serif', fontStyle: 'italic', color }}>{value}</p>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* AI Insight */}
      {insight && !insightDismissed && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(45,82,64,0.08)', borderRadius: 10, border: '1px solid rgba(45,82,64,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: C.darkGreen, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>AI Revenue Insight</p>
            <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{insight}</p>
          </div>
          <button onClick={() => setInsightDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 20, padding: 4 }}>×</button>
        </div>
      )}

      {/* Reminder alert */}
      {needReminder.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.amber }}>⏰ {needReminder.length} booking{needReminder.length > 1 ? 's' : ''} tomorrow without a reminder</p>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{needReminder.map(b => b.customer_name).join(', ')}</p>
          </div>
          <button onClick={() => needReminder.forEach(b => sendReminder(b))} style={{ ...btnPrimary, background: 'rgba(245,158,11,0.15)', color: C.amber, border: '1px solid rgba(245,158,11,0.3)' }}>Send all reminders</button>
        </div>
      )}

      {/* Add booking form */}
      {showAdd && (
        <div style={{ background: C.card, borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid ' + C.border }}>
          <p style={{ fontWeight: 700, marginBottom: 14 }}>New booking</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Customer name *</label><input value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} style={iStyle} placeholder="Jane Smith" /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Phone (SMS reminders)</label><input value={form.customer_phone} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))} style={iStyle} placeholder="0412 345 678" /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Email</label><input value={form.customer_email} onChange={e => setForm(p => ({ ...p, customer_email: e.target.value }))} style={iStyle} placeholder="jane@email.com" /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Service</label>
              <select value={form.service_id} onChange={e => setForm(p => ({ ...p, service_id: e.target.value }))} style={iStyle}>
                <option value="">No specific service</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes}min{s.price ? ` · $${s.price}` : ''})</option>)}
              </select></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Date *</label><input type="date" value={form.booking_date} onChange={e => setForm(p => ({ ...p, booking_date: e.target.value }))} style={iStyle} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Time</label><input type="time" value={form.booking_time} onChange={e => setForm(p => ({ ...p, booking_time: e.target.value }))} style={iStyle} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Party size</label><input type="number" min={1} max={50} value={form.party_size} onChange={e => setForm(p => ({ ...p, party_size: parseInt(e.target.value) || 1 }))} style={iStyle} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Notes</label><input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={iStyle} placeholder="Special requests…" /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={addBooking} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save booking'}</button>
            <button onClick={() => setShowAdd(false)} style={{ ...btnPrimary, background: 'transparent', color: C.muted, border: '1px solid ' + C.border }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid ' + C.border }}>
        {([['calendar', '📅 Calendar'], ['list', '📋 List'], ['services', '🛎 Services'], ['availability', '⚙️ Availability'], ['tables', '🪑 Tables']] as const).map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); if (t === 'availability') loadAvailability() }}
            style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? C.green : C.muted, borderBottom: '2px solid ' + (tab === t ? C.green : 'transparent'), marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* CALENDAR TAB */}
      {tab === 'calendar' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid ' + C.border }}>
              {(['week', 'month'] as const).map(v => (
                <button key={v} onClick={() => setCalView(v)} style={{ padding: '5px 14px', background: calView === v ? C.darkGreen : 'transparent', color: calView === v ? C.green : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>
            {calView === 'week' && (
              <>
                <button onClick={() => setWeekOf(p => addDays(p, -7))} style={{ ...btnPrimary, padding: '5px 12px' }}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(dateStr(weekDays[0]))} – {fmtDate(dateStr(weekDays[6]))}</span>
                <button onClick={() => setWeekOf(p => addDays(p, 7))} style={{ ...btnPrimary, padding: '5px 12px' }}>›</button>
                <button onClick={() => setWeekOf(weekStart(new Date()))} style={{ ...btnPrimary, background: 'transparent', color: C.muted, border: '1px solid ' + C.border, fontSize: 12 }}>Today</button>
              </>
            )}
            {calView === 'month' && (
              <>
                <button onClick={() => setMonthOf(p => new Date(p.getFullYear(), p.getMonth() - 1, 1))} style={{ ...btnPrimary, padding: '5px 12px' }}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{monthOf.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => setMonthOf(p => new Date(p.getFullYear(), p.getMonth() + 1, 1))} style={{ ...btnPrimary, padding: '5px 12px' }}>›</button>
                <button onClick={() => setMonthOf(monthStart(new Date()))} style={{ ...btnPrimary, background: 'transparent', color: C.muted, border: '1px solid ' + C.border, fontSize: 12 }}>Today</button>
              </>
            )}
          </div>

          {/* Week grid */}
          {calView === 'week' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                {weekDays.map(day => {
                  const ds = dateStr(day)
                  const dayBookings = bookings.filter(b => b.booking_date === ds && b.status !== 'cancelled')
                  const isToday = ds === today
                  return (
                    <div key={ds} onClick={() => setSelectedDate(ds)}
                      style={{ background: selectedDate === ds ? 'rgba(45,82,64,0.2)' : C.card, borderRadius: 10, padding: 10, cursor: 'pointer', border: '1px solid ' + (isToday ? C.green : selectedDate === ds ? C.darkGreen : C.border), minHeight: 110 }}>
                      <p style={{ fontSize: 11, color: isToday ? C.green : C.muted, fontWeight: isToday ? 700 : 400, marginBottom: 6 }}>{day.toLocaleDateString('en-AU', { weekday: 'short' })} {day.getDate()}</p>
                      {dayBookings.slice(0, 3).map(b => (
                        <div key={b.id} onClick={e => { e.stopPropagation(); setSelectedBooking(b) }} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: STATUS_COLOR[b.status] + '20', color: STATUS_COLOR[b.status], marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                          {fmtTime(b.booking_time)} {b.customer_name}
                        </div>
                      ))}
                      {dayBookings.length > 3 && <p style={{ fontSize: 10, color: C.muted }}>+{dayBookings.length - 3} more</p>}
                    </div>
                  )
                })}
              </div>
              {selectedDate && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{fmtDate(selectedDate)}</p>
                  {bookings.filter(b => b.booking_date === selectedDate && b.status !== 'cancelled').length === 0
                    ? <p style={{ color: C.muted, fontSize: 13 }}>No bookings this day.</p>
                    : bookings.filter(b => b.booking_date === selectedDate && b.status !== 'cancelled').map(b => (
                      <BookingCard key={b.id} b={b} onStatus={updateStatus} onRemind={sendReminder} sending={!!sending[b.id]} onClick={setSelectedBooking} />
                    ))}
                </div>
              )}
            </>
          )}

          {/* Month grid */}
          {calView === 'month' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
                {DAY_NAMES.map(d => <div key={d} style={{ fontSize: 10, color: C.muted, textAlign: 'center', padding: '4px 0', fontWeight: 600 }}>{d}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                {monthDays.map((day, i) => {
                  if (!day) return <div key={i} />
                  const ds = dateStr(day)
                  const cnt = bookings.filter(b => b.booking_date === ds && b.status !== 'cancelled').length
                  const isToday = ds === today
                  return (
                    <div key={ds} onClick={() => { setSelectedDate(ds); setCalView('week'); setWeekOf(weekStart(day)) }}
                      style={{ background: isToday ? 'rgba(45,82,64,0.2)' : C.card, borderRadius: 8, padding: '8px 6px', cursor: 'pointer', border: '1px solid ' + (isToday ? C.green : C.border), minHeight: 60, textAlign: 'center' }}>
                      <p style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? C.green : C.text, marginBottom: 4 }}>{day.getDate()}</p>
                      {cnt > 0 && <div style={{ fontSize: 10, background: C.green + '30', color: C.green, borderRadius: 10, padding: '1px 5px', display: 'inline-block' }}>{cnt}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LIST TAB */}
      {tab === 'list' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {['all', ...STATUS_LABELS].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid ' + (statusFilter === s ? C.green : C.border), background: statusFilter === s ? 'rgba(127,184,151,0.1)' : 'transparent', color: statusFilter === s ? C.green : C.muted, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize' }}>
                {s}
              </button>
            ))}
          </div>
          {loading ? <p style={{ color: C.muted }}>Loading…</p> :
            filteredBookings.length === 0 ? <p style={{ color: C.muted, fontSize: 13 }}>No bookings found.</p> :
              filteredBookings.sort((a, b) => a.booking_date.localeCompare(b.booking_date)).map(b => (
                <BookingCard key={b.id} b={b} onStatus={updateStatus} onRemind={sendReminder} sending={!!sending[b.id]} onClick={setSelectedBooking} />
              ))}
        </div>
      )}

      {/* SERVICES TAB */}
      {tab === 'services' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, marginBottom: 20 }}>
            {services.map(s => (
              <div key={s.id} style={{ background: C.card, borderRadius: 12, padding: '14px 16px', borderLeft: '3px solid ' + s.color }}>
                <p style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{s.duration_minutes} min{s.price ? ` · $${s.price}` : ''}</p>
                {s.description && <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{s.description}</p>}
                <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Max party: {s.max_party_size}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => startEditService(s)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'transparent', color: C.muted, border: '1px solid ' + C.border, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => archiveService(s.id)} disabled={archivingId === s.id} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'transparent', color: C.red, border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer' }}>{archivingId === s.id ? 'Archiving…' : 'Archive'}</button>
                </div>
              </div>
            ))}
            {services.length === 0 && <p style={{ color: C.muted, fontSize: 13 }}>No services yet — add one below.</p>}
          </div>
          {/* Booking link */}
          <div style={{ background: C.card, borderRadius: 14, padding: 20, border: '1px solid ' + C.border, marginBottom: 16 }}>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>Public booking link</p>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Share this link so customers can book online.</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.muted, whiteSpace: 'nowrap' as const }}>/book/</span>
              <input value={slugInput} onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60))} style={iStyle} placeholder="your-business-name" />
              <button onClick={saveSlug} disabled={slugSaving} style={{ ...btnPrimary, whiteSpace: 'nowrap' as const }}>{slugSaving ? 'Saving…' : 'Save'}</button>
            </div>
            {bizSlug && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <a href={'/book/' + bizSlug} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.green }}>→ /book/{bizSlug}</a>
                <button onClick={copyLink} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: copied ? 'rgba(127,184,151,0.15)' : 'transparent', color: copied ? C.green : C.muted, border: '1px solid ' + C.border, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy link'}</button>
              </div>
            )}
          </div>
          {/* Add / edit service form */}
          <div style={{ background: C.card, borderRadius: 14, padding: 20, border: '1px solid ' + C.border }}>
            <p style={{ fontWeight: 700, marginBottom: 14 }}>{editingServiceId ? 'Edit service' : 'Add service'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Service name *</label><input value={svcForm.name} onChange={e => setSvcForm(p => ({ ...p, name: e.target.value }))} style={iStyle} placeholder="e.g. Table reservation" /></div>
              <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Duration (min)</label><input type="number" value={svcForm.duration_minutes} onChange={e => setSvcForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) || 60 }))} style={iStyle} /></div>
              <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Price ($)</label><input value={svcForm.price} onChange={e => setSvcForm(p => ({ ...p, price: e.target.value }))} style={iStyle} placeholder="Leave blank if free" /></div>
              <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Max party size</label><input type="number" value={svcForm.max_party_size} onChange={e => setSvcForm(p => ({ ...p, max_party_size: parseInt(e.target.value) || 20 }))} style={iStyle} /></div>
              <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Description</label><input value={svcForm.description} onChange={e => setSvcForm(p => ({ ...p, description: e.target.value }))} style={iStyle} placeholder="Optional" /></div>
              <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Colour</label><input type="color" value={svcForm.color} onChange={e => setSvcForm(p => ({ ...p, color: e.target.value }))} style={{ ...iStyle, padding: 4, height: 38 }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={saveService} disabled={savingService} style={btnPrimary}>{savingService ? 'Saving…' : editingServiceId ? 'Save changes' : 'Add service'}</button>
              {editingServiceId && <button onClick={resetSvcForm} style={{ ...btnPrimary, background: 'transparent', color: C.muted, border: '1px solid ' + C.border }}>Cancel</button>}
            </div>
          </div>
        </div>
      )}

      {/* AVAILABILITY TAB */}
      {tab === 'availability' && (
        <div>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Set your business hours. Customers can only book during available windows.</p>
          <div style={{ background: C.card, borderRadius: 14, padding: 20, border: '1px solid ' + C.border, marginBottom: 16 }}>
            {availability.map((a, i) => (
              <div key={a.day_of_week} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 80 }}>
                  <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a.day_of_week]}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={a.is_available} onChange={e => setAvailability(p => p.map((x, j) => j === i ? { ...x, is_available: e.target.checked } : x))} style={{ accentColor: C.green }} />
                    <span style={{ fontSize: 11, color: a.is_available ? C.green : C.muted }}>{a.is_available ? 'Open' : 'Closed'}</span>
                  </div>
                </div>
                {a.is_available && (
                  <>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Open</label>
                      <input type="time" value={a.start_time} onChange={e => setAvailability(p => p.map((x, j) => j === i ? { ...x, start_time: e.target.value } : x))} style={{ ...iStyle, width: 'auto' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Close</label>
                      <input type="time" value={a.end_time} onChange={e => setAvailability(p => p.map((x, j) => j === i ? { ...x, end_time: e.target.value } : x))} style={{ ...iStyle, width: 'auto' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 80 }}>
                      <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Buffer (min)</label>
                      <input type="number" min={0} max={120} value={a.buffer_minutes} onChange={e => setAvailability(p => p.map((x, j) => j === i ? { ...x, buffer_minutes: parseInt(e.target.value) || 0 } : x))} style={{ ...iStyle, width: 70 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Max bookings/day</label>
                      <input type="number" min={0} value={a.max_bookings_per_day ?? ''} onChange={e => setAvailability(p => p.map((x, j) => j === i ? { ...x, max_bookings_per_day: e.target.value === '' ? null : parseInt(e.target.value) || 0 } : x))} style={{ ...iStyle, width: 90 }} placeholder="No limit" />
                    </div>
                  </>
                )}
              </div>
            ))}
            <button onClick={saveAvailability} disabled={availSaving} style={btnPrimary}>{availSaving ? 'Saving…' : 'Save availability'}</button>
          </div>
        </div>
      )}

      {/* TABLES TAB — FLOOR-1: mode switch + reused FloorPlan canvas, configMode for booking properties */}
      {tab === 'tables' && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>How should guests pick a seat?</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {([
              ['auto', 'Just a time', 'We seat them — no table choice shown online.'],
              ['area', 'By area', 'Guests pick a section (e.g. Patio, Window) — we seat them within it.'],
              ['table', 'By table', 'Guests pick an exact table from a floor plan.'],
            ] as const).map(([mode, label, desc]) => (
              <button key={mode} onClick={() => saveTableMode(mode)} disabled={tableModeSaving}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                  background: tableMode === mode ? 'rgba(127,184,151,0.12)' : C.card,
                  border: '1px solid ' + (tableMode === mode ? C.green : C.border),
                  opacity: tableModeSaving ? 0.6 : 1,
                }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: tableMode === mode ? C.green : C.text, marginBottom: 3 }}>{label}</p>
                <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{desc}</p>
              </button>
            ))}
          </div>

          <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
            Build your room: drag tables into place, resize and rotate them, add non-bookable elements
            like the bar or entrance so the plan reads like the real space. Click a table to set its
            capacity, shape, seating area, and whether guests can pick it themselves.
          </p>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid ' + C.border, padding: 16, background: '#0a0f0c' }}>
            {bid && <FloorPlan businessId={bid} onTableSelect={() => {}} layoutMode="canvas" />}
          </div>
        </div>
      )}

      {/* Booking detail modal */}
      {selectedBooking && (
        <div onClick={() => setSelectedBooking(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid ' + C.border }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{selectedBooking.customer_name}</h2>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: STATUS_COLOR[selectedBooking.status] + '20', color: STATUS_COLOR[selectedBooking.status], fontWeight: 600, textTransform: 'capitalize' as const, marginTop: 4, display: 'inline-block' }}>{selectedBooking.status}</span>
              </div>
              <button onClick={() => setSelectedBooking(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: C.muted, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {selectedBooking.booking_services && <span>📋 {selectedBooking.booking_services.name}</span>}
              <span>📅 {fmtDate(selectedBooking.booking_date)}{selectedBooking.booking_time ? ' at ' + fmtTime(selectedBooking.booking_time) : ''}</span>
              <span>👥 {selectedBooking.party_size} {selectedBooking.party_size === 1 ? 'person' : 'people'} · {selectedBooking.duration_minutes}min</span>
              {selectedBooking.customer_phone && <span>📱 {selectedBooking.customer_phone}</span>}
              {selectedBooking.customer_email && <span>✉️ {selectedBooking.customer_email}</span>}
              {selectedBooking.notes && <span style={{ fontStyle: 'italic' }}>💬 "{selectedBooking.notes}"</span>}
            </div>
            {selectedBooking.aria_notes && (
              <div style={{ padding: '10px 14px', background: 'rgba(45,82,64,0.1)', borderRadius: 8, marginBottom: 16, border: '1px solid rgba(45,82,64,0.2)' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: C.darkGreen, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aria Notes</p>
                <p style={{ fontSize: 12, color: C.text, margin: 0 }}>{selectedBooking.aria_notes}</p>
              </div>
            )}
            {selectedBooking.reminder_sent_at && <p style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>✉️ Reminder sent {new Date(selectedBooking.reminder_sent_at).toLocaleDateString('en-AU')}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selectedBooking.status === 'confirmed' && (
                <button onClick={() => updateStatus(selectedBooking.id, 'completed')} style={{ ...btnPrimary, fontSize: 12 }}>✓ Mark complete</button>
              )}
              {selectedBooking.status === 'confirmed' && !selectedBooking.reminder_sent_at && selectedBooking.customer_phone && (
                <button onClick={() => sendReminder(selectedBooking)} disabled={!!sending[selectedBooking.id]} style={{ ...btnPrimary, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)', fontSize: 12 }}>
                  {sending[selectedBooking.id] ? 'Sending…' : '📱 Send reminder'}
                </button>
              )}
              {selectedBooking.status !== 'cancelled' && selectedBooking.status !== 'completed' && (
                <button onClick={() => updateStatus(selectedBooking.id, 'cancelled')} style={{ ...btnPrimary, background: 'rgba(239,68,68,0.1)', color: C.red, border: '1px solid rgba(239,68,68,0.25)', fontSize: 12 }}>Cancel booking</button>
              )}
              {selectedBooking.booking_token && (
                <a href={'/book/cancel/' + selectedBooking.booking_token} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimary, background: 'transparent', color: C.muted, border: '1px solid ' + C.border, fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Self-cancel link ↗</a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
