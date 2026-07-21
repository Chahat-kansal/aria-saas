'use client'
// BOOKINGS-CX-BUILD-1 — re-skinned onto the shared Pipel tokens (BOOKINGS-UI-SPEC.md Part 5:
// "manage/cancel screens in the same language"). Same logic as before, Pipel palette/type/shape.
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import { BG, INK, INK_MUTED, ACCENT, ACCENT_TEXT, RED, FD, FB, glassCard, pillPrimary, pillOutline } from '@/components/booking/tokens'

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function dateStr(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(s: string) { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) }
function fmtTime(t: string | null) { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'pm' : 'am'}` }

const dangerBtn: React.CSSProperties = { background: RED, color: '#fff', border: 'none', borderRadius: 100, padding: '12px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: FB, width: '100%' }

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
      <p style={{ color: INK_MUTED }}>No booking token provided.</p>
      <a href={`/book/${slug}`} style={{ color: INK, fontWeight: 700, fontSize: 14 }}>Make a new booking</a>
    </div>
  )

  if (loading) return <p style={{ color: INK_MUTED, textAlign: 'center', padding: 40 }}>Loading…</p>

  if (!booking) return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: INK_MUTED, marginBottom: 12 }}>Booking not found. The link may have expired.</p>
      <a href={`/book/${slug}`} style={{ color: INK, fontWeight: 700, fontSize: 14 }}>Make a new booking</a>
    </div>
  )

  if (done === 'cancelled') return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(217,245,78,0.20)', border: '2px solid ' + ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px', color: ACCENT_TEXT }}>✓</div>
      <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 8px' }}>Booking cancelled</h2>
      <p style={{ color: INK_MUTED, marginBottom: 20 }}>Your booking has been cancelled. We hope to see you another time.</p>
      <a href={`/book/${slug}`} style={{ color: INK, fontWeight: 700, fontSize: 14 }}>Make a new booking</a>
    </div>
  )

  if (done === 'rescheduled') return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(217,245,78,0.20)', border: '2px solid ' + ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px', color: ACCENT_TEXT }}>✓</div>
      <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, color: INK, margin: '0 0 8px' }}>Booking rescheduled!</h2>
      <div style={{ ...glassCard, padding: 20, textAlign: 'left', margin: '20px auto', maxWidth: 340 }}>
        <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>📅 {fmtDate(booking.booking_date)}</p>
        {booking.booking_time && <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>🕐 {fmtTime(booking.booking_time)}</p>}
      </div>
    </div>
  )

  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 8, fontFamily: FB }}>Your booking</p>
      <div style={{ ...glassCard, padding: '14px 18px', marginBottom: 20 }}>
        {booking.booking_services && <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>📋 {booking.booking_services.name}</p>}
        <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>📅 {fmtDate(booking.booking_date)}</p>
        {booking.booking_time && <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>🕐 {fmtTime(booking.booking_time)}</p>}
        <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>👤 {booking.customer_name}</p>
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, padding: '3px 10px', borderRadius: 100, background: booking.status === 'confirmed' ? ACCENT : 'rgba(239,68,68,0.10)', color: booking.status === 'confirmed' ? ACCENT_TEXT : RED, fontWeight: 700, textTransform: 'capitalize' }}>{booking.status}</span>
      </div>

      {booking.status !== 'cancelled' && booking.status !== 'completed' && action === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setAction('reschedule')} style={{ ...pillPrimary, height: 46 }}>Reschedule booking</button>
          <button onClick={() => setAction('cancel')} style={dangerBtn}>Cancel booking</button>
        </div>
      )}

      {action === 'cancel' && (
        <div>
          <p style={{ color: INK, marginBottom: 16, fontSize: 14 }}>Are you sure you want to cancel this booking?</p>
          {error && <p style={{ color: RED, fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setAction('idle')} style={{ ...pillOutline, flex: 1, height: 46 }}>← Back</button>
            <button onClick={() => doAction('cancel')} disabled={submitting} style={{ ...dangerBtn, flex: 2, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Cancelling…' : 'Yes, cancel booking'}
            </button>
          </div>
        </div>
      )}

      {action === 'reschedule' && (
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 12, fontFamily: FB }}>Choose a new date</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setWeekOf(p => addDays(p, -7))} style={{ background: 'rgba(255,255,255,0.72)', border: 'none', borderRadius: 100, padding: '6px 14px', cursor: 'pointer', color: INK, fontSize: 16 }}>‹</button>
            <span style={{ fontSize: 12, color: INK_MUTED, flex: 1, textAlign: 'center', fontFamily: FB }}>
              {weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {weekDays[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
            <button onClick={() => setWeekOf(p => addDays(p, 7))} style={{ background: 'rgba(255,255,255,0.72)', border: 'none', borderRadius: 100, padding: '6px 14px', cursor: 'pointer', color: INK, fontSize: 16 }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 16 }}>
            {weekDays.map(d => {
              const ds = dateStr(d)
              const isPast = ds < today
              const isSel = ds === newDate
              return (
                <div key={ds} onClick={() => !isPast && (setNewDate(ds), setNewTime(''))}
                  style={{ borderRadius: 12, padding: '10px 4px', textAlign: 'center', cursor: isPast ? 'not-allowed' : 'pointer', background: isSel ? ACCENT : 'rgba(255,255,255,0.72)', opacity: isPast ? 0.38 : 1 }}>
                  <p style={{ fontSize: 10, color: isSel ? ACCENT_TEXT : INK_MUTED, margin: '0 0 4px', fontFamily: FB }}>{d.toLocaleDateString('en-AU', { weekday: 'narrow' })}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: isSel ? ACCENT_TEXT : INK, margin: 0, fontFamily: FB }}>{d.getDate()}</p>
                </div>
              )
            })}
          </div>
          {newDate && (
            <div style={{ marginBottom: 16 }}>
              {slotsLoading ? (
                <p style={{ color: INK_MUTED, fontSize: 13 }}>Checking availability…</p>
              ) : slots.length === 0 ? (
                <p style={{ color: INK_MUTED, fontSize: 13 }}>No available slots on this day. Choose another date.</p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: INK_MUTED, marginBottom: 8, fontFamily: FB }}>Select a time</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {slots.map(t => (
                      <div key={t} onClick={() => setNewTime(t)}
                        style={{ borderRadius: 100, padding: '10px 4px', textAlign: 'center', cursor: 'pointer', background: newTime === t ? ACCENT : 'rgba(255,255,255,0.72)', color: newTime === t ? ACCENT_TEXT : INK, fontWeight: 700, fontSize: 13, fontFamily: FB }}>
                        {fmtTime(t)}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {error && <p style={{ color: RED, fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setAction('idle'); setNewDate(''); setNewTime('') }} style={{ ...pillOutline, flex: 1, height: 48 }}>← Back</button>
            <button onClick={() => doAction('reschedule')} disabled={submitting || !newDate} style={{ ...pillPrimary, flex: 2, height: 48, opacity: submitting || !newDate ? 0.55 : 1 }}>
              {submitting ? 'Saving…' : 'Confirm reschedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ManagePage() {
  const slug = (useParams()?.slug as string) ?? ''
  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, padding: '40px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, fontWeight: 400, color: INK, margin: '0 0 4px' }}>Manage your booking</h1>
          <p style={{ fontSize: 13, color: INK_MUTED }}>Cancel or reschedule your appointment</p>
        </div>
        <Suspense fallback={<p style={{ color: INK_MUTED, textAlign: 'center' }}>Loading…</p>}>
          <ManageContent slug={slug} />
        </Suspense>
      </div>
    </div>
  )
}
