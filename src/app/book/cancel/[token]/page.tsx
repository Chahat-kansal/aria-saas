'use client'
// BOOKINGS-CX-BUILD-1 — re-skinned onto the shared Pipel tokens (BOOKINGS-UI-SPEC.md Part 5:
// "manage/cancel screens in the same language"). Same logic as before, Pipel palette/type/shape.
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { BG, INK, INK_MUTED, ACCENT, ACCENT_TEXT, RED, FD, FB, glassCard } from '@/components/booking/tokens'

function fmtDate(s: string) { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) }
function fmtTime(t: string | null) { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'pm' : 'am'}` }

interface Booking {
  id: string; status: string; customer_name: string; booking_date: string; booking_time: string | null
  booking_services: { name: string } | null
  businesses: { name: string; booking_link_slug: string | null } | null
}

export default function CancelPage() {
  const token = (useParams()?.token as string) ?? ''
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/bookings/public?token=' + token)
      .then(r => r.json())
      .then(d => { if (d.booking) setBooking(d.booking); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  async function cancel() {
    setCancelling(true); setError('')
    const res = await fetch('/api/bookings/public?token=' + token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', cancellation_reason: 'Customer cancelled online' }),
    })
    const d = await res.json()
    if (d.booking) { setBooking(d.booking); setDone(true) }
    else setError(d.error || 'Could not cancel booking. Please try again.')
    setCancelling(false)
  }

  const center: React.CSSProperties = { minHeight: '100dvh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB, padding: 16 }

  if (loading) return <div style={center}><p style={{ color: INK_MUTED }}>Loading…</p></div>

  if (!booking) return (
    <div style={center}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: INK_MUTED, marginBottom: 12 }}>Booking not found. The link may have expired.</p>
      </div>
    </div>
  )

  const bizName = booking.businesses?.name ?? ''
  const slug = booking.businesses?.booking_link_slug ?? null

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, padding: '40px 16px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: ACCENT, color: ACCENT_TEXT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 10 }}>📅</div>
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, fontWeight: 400, color: INK, margin: '0 0 4px' }}>Cancel booking</h1>
          {bizName && <p style={{ fontSize: 13, color: INK_MUTED }}>{bizName}</p>}
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(217,245,78,0.20)', border: '2px solid ' + ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16, color: ACCENT_TEXT }}>✓</div>
            <h2 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 20, color: INK, margin: '0 0 8px' }}>Booking cancelled</h2>
            <p style={{ color: INK_MUTED, fontSize: 14, marginBottom: 20 }}>Your booking has been cancelled. We hope to see you another time!</p>
            {slug && (
              <a href={'/book/' + slug} style={{ color: INK, fontWeight: 700, fontSize: 14 }}>Book again</a>
            )}
          </div>
        ) : booking.status === 'cancelled' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: INK_MUTED, fontSize: 14 }}>This booking is already cancelled.</p>
            {slug && <a href={'/book/' + slug} style={{ color: INK, fontWeight: 700, fontSize: 14, display: 'block', marginTop: 12 }}>Make a new booking</a>}
          </div>
        ) : (
          <div>
            <div style={{ ...glassCard, padding: '16px 18px', marginBottom: 20 }}>
              {booking.booking_services && <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>📋 {booking.booking_services.name}</p>}
              <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>📅 {fmtDate(booking.booking_date)}</p>
              {booking.booking_time && <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>🕐 {fmtTime(booking.booking_time)}</p>}
              <p style={{ fontSize: 13, color: INK_MUTED, margin: '4px 0' }}>👤 {booking.customer_name}</p>
              <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, padding: '3px 10px', borderRadius: 100, background: ACCENT, color: ACCENT_TEXT, fontWeight: 700, textTransform: 'capitalize' }}>{booking.status}</span>
            </div>
            <p style={{ fontSize: 13, color: INK_MUTED, marginBottom: 16, textAlign: 'center' }}>
              Are you sure you want to cancel this booking?
            </p>
            {error && <p style={{ color: RED, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</p>}
            <button
              onClick={cancel}
              disabled={cancelling}
              style={{ width: '100%', padding: 14, borderRadius: 100, background: RED, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, fontFamily: FB, cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.65 : 1, minHeight: 50 }}
            >
              {cancelling ? 'Cancelling…' : 'Yes, cancel booking'}
            </button>
            {slug && (
              <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: INK_MUTED }}>
                Changed your mind?{' '}
                <a href={'/book/' + slug + '/manage?token=' + token} style={{ color: INK, fontWeight: 700 }}>Reschedule instead</a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
