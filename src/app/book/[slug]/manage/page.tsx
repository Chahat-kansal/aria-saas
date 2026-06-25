'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useParams } from 'next/navigation'

const L = { bg: '#f0f7f4', card: '#fff', text: '#1a2e22', muted: '#6b7c72', green: '#7FB897', dark: '#2D5240', border: '#d4e8db', red: '#ef4444', amber: '#f59e0b' }

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function dateStr(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(s: string) { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) }
function fmtTime(t: string | null) { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'pm' : 'am'}` }

function btn(primary: boolean, danger?: boolean): React.CSSProperties {
  const bg = danger ? L.red : primary ? L.dark : '#fff'
  const color = (primary || danger) ? '#fff' : L.dark
  const border = danger ? L.red : primary ? L.dark : L.border
  return { background: bg, color, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, width: '100%' }
}

interface Booking {
  id: string; business_id: string; status: string; customer_name: string; customer_email: string | null
  booking_date: string; booking_time: string | null; duration_minutes: number
  booking_services: { name: string } | null; booking_token: string
}

function ManageContent({ slug }: { slug: string }) {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'idle' | 'cancel' | 'reschedule'>('idle')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [slots, setSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<'cancelled' | 'rescheduled' | null>(null)
  const [error, setError] = useState('')
  const [weekOf, setWeekOf] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d
  })

  useEffect(() => {
    if (!token) { setLoading(false); return }
    fetch(`/api/bookings/public?token=${token}`)
      .then(r => r.json())
      .then(d => { if (d.booking) setBooking(d.booking); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!booking || !newDate) return
    setSlotsLoading(true)
    setSlots([])
    fetch(`/api/bookings/availability?business_id=${booking.business_id}&date=${newDate}`)
      .then(r => r.json())
      .then(d => { setSlots(d.slots ?? []); setSlotsLoading(false) })
  }, [booking, newDate])

  async function doAction(act: 'cancel' | 'reschedule') {
    if (!token) return
    setSubmitting(true); setError('')
    const body: Record<string, unknown> = { action: act }
    if (act === 'reschedule') {
      if (!newDate) { setError('Please select a new date.'); setSubmitting(false); return }
      body.booking_date = newDate
      if (newTime) body.booking_time = newTime
    }
    const res = await fetch(`/api/bookings/public?token=${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    if (d.booking) {
      setBooking(d.booking)
      setDone(act === 'cancel' ? 'cancelled' : 'rescheduled')
    } else setError(d.error || 'Something went wrong. Please try again.')
    setSubmitting(false)
  }

  const today = dateStr(new Date())
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i))

  if (!token) return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: L.muted }}>No booking token provided.</p>
      <a href={`/book/${slug}`} style={{ color: L.dark, fontWeight: 600, fontSize: 14 }}>Make a new booking</a>
    </div>
  )

  if (loading) return <p style={{ color: L.muted, textAlign: 'center', padding: 40 }}>Loading…</p>

  if (!booking) return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: L.muted, marginBottom: 12 }}>Booking not found. The link may have expired.</p>
      <a href={`/book/${slug}`} style={{ color: L.dark, fontWeight: 600, fontSize: 14 }}>Make a new booking</a>
    </div>
  )

  if (done === 'cancelled') return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: L.text, margin: '0 0 8px' }}>Booking cancelled</h2>
      <p style={{ color: L.muted, marginBottom: 20 }}>Your booking has been cancelled. We hope to see you another time.</p>
      <a href={`/book/${slug}`} style={{ color: L.dark, fontWeight: 600, fontSize: 14 }}>Make a new booking</a>
    </div>
  )

  if (done === 'rescheduled') return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 40, color: L.green, marginBottom: 16 }}>✓</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: L.text, margin: '0 0 8px' }}>Booking rescheduled!</h2>
      <div style={{ background: L.card, borderRadius: 12, padding: 20, textAlign: 'left', margin: '20px auto', border: `1px solid ${L.border}`, maxWidth: 340 }}>
        <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>📅 {fmtDate(booking.booking_date)}</p>
        {booking.booking_time && <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>🕐 {fmtTime(booking.booking_time)}</p>}
      </div>
    </div>
  )

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 600, color: L.text, marginBottom: 8 }}>Your booking</p>
      <div style={{ background: L.card, borderRadius: 12, padding: '14px 18px', marginBottom: 20, border: `1px solid ${L.border}` }}>
        {booking.booking_services && <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>📋 {booking.booking_services.name}</p>}
        <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>📅 {fmtDate(booking.booking_date)}</p>
        {booking.booking_time && <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>🕐 {fmtTime(booking.booking_time)}</p>}
        <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>👤 {booking.customer_name}</p>
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, padding: '3px 10px', borderRadius: 10, background: booking.status === 'confirmed' ? 'rgba(127,184,151,0.15)' : 'rgba(239,68,68,0.08)', color: booking.status === 'confirmed' ? L.green : L.red, fontWeight: 600, textTransform: 'capitalize' }}>{booking.status}</span>
      </div>

      {booking.status !== 'cancelled' && booking.status !== 'completed' && action === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setAction('reschedule')} style={btn(true)}>Reschedule booking</button>
          <button onClick={() => setAction('cancel')} style={btn(false, true)}>Cancel booking</button>
        </div>
      )}

      {action === 'cancel' && (
        <div>
          <p style={{ color: L.text, marginBottom: 16, fontSize: 14 }}>Are you sure you want to cancel this booking?</p>
          {error && <p style={{ color: L.red, fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setAction('idle')} style={{ ...btn(false), width: 'auto', padding: '12px 20px' }}>← Back</button>
            <button onClick={() => doAction('cancel')} disabled={submitting} style={{ ...btn(false, true), opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Cancelling…' : 'Yes, cancel booking'}
            </button>
          </div>
        </div>
      )}

      {action === 'reschedule' && (
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: L.text, marginBottom: 12 }}>Choose a new date</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setWeekOf(p => addDays(p, -7))} style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', color: L.dark, fontSize: 16 }}>‹</button>
            <span style={{ fontSize: 12, color: L.muted, flex: 1, textAlign: 'center' }}>
              {weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {weekDays[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
            <button onClick={() => setWeekOf(p => addDays(p, 7))} style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', color: L.dark, fontSize: 16 }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 16 }}>
            {weekDays.map(d => {
              const ds = dateStr(d)
              const isPast = ds < today
              const isSel = ds === newDate
              return (
                <div key={ds} onClick={() => !isPast && (setNewDate(ds), setNewTime(''))}
                  style={{ borderRadius: 10, padding: '10px 4px', textAlign: 'center', cursor: isPast ? 'not-allowed' : 'pointer', background: isSel ? L.dark : L.card, border: `1px solid ${isSel ? L.dark : L.border}`, opacity: isPast ? 0.38 : 1 }}>
                  <p style={{ fontSize: 10, color: isSel ? 'rgba(255,255,255,0.6)' : L.muted, margin: '0 0 4px' }}>{d.toLocaleDateString('en-AU', { weekday: 'narrow' })}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: isSel ? '#fff' : L.text, margin: 0 }}>{d.getDate()}</p>
                </div>
              )
            })}
          </div>
          {newDate && (
            <div style={{ marginBottom: 16 }}>
              {slotsLoading ? (
                <p style={{ color: L.muted, fontSize: 13 }}>Checking availability…</p>
              ) : slots.length === 0 ? (
                <p style={{ color: L.muted, fontSize: 13 }}>No available slots on this day. Choose another date.</p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: L.muted, marginBottom: 8 }}>Select a time</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                    {slots.map(t => (
                      <div key={t} onClick={() => setNewTime(t)}
                        style={{ borderRadius: 8, padding: '8px 4px', textAlign: 'center', cursor: 'pointer', background: newTime === t ? L.dark : L.card, border: `1px solid ${newTime === t ? L.dark : L.border}`, color: newTime === t ? '#fff' : L.text, fontWeight: 600, fontSize: 12 }}>
                        {fmtTime(t)}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {error && <p style={{ color: L.red, fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setAction('idle'); setNewDate(''); setNewTime('') }} style={{ ...btn(false), width: 'auto', padding: '12px 20px' }}>← Back</button>
            <button onClick={() => doAction('reschedule')} disabled={submitting || !newDate} style={{ ...btn(true), opacity: submitting || !newDate ? 0.55 : 1 }}>
              {submitting ? 'Saving…' : 'Confirm reschedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ManagePage() {
  // BUGFIX-BOOK-USE-HOOK: Next 14 passes params as a plain object — use(params) threw. useParams() is correct.
  const slug = (useParams()?.slug as string) ?? ''
  return (
    <div style={{ minHeight: '100vh', background: L.bg, fontFamily: 'Inter,sans-serif', padding: '40px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: L.text, margin: '0 0 4px' }}>Manage your booking</h1>
          <p style={{ fontSize: 13, color: L.muted }}>Cancel or reschedule your appointment</p>
        </div>
        <Suspense fallback={<p style={{ color: L.muted, textAlign: 'center' }}>Loading…</p>}>
          <ManageContent slug={slug} />
        </Suspense>
      </div>
    </div>
  )
}
