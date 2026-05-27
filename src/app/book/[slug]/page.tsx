'use client'
import { useState, useEffect, use } from 'react'

const L = { bg: '#f0f7f4', card: '#fff', text: '#1a2e22', muted: '#6b7c72', green: '#7FB897', dark: '#2D5240', border: '#d4e8db', red: '#ef4444' }

interface Business { id: string; name: string; industry: string | null; booking_link_slug: string }
interface Service { id: string; name: string; duration_minutes: number; price: number | null; color: string; description: string | null }

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function dateStr(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(s: string) { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) }
function fmtTime(t: string) { const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'pm' : 'am'}` }

function btn(primary: boolean): React.CSSProperties {
  return { background: primary ? L.dark : '#fff', color: primary ? '#fff' : L.dark, border: `1px solid ${primary ? L.dark : L.border}`, borderRadius: 10, padding: '12px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 600, width: '100%' }
}
function iStyle(): React.CSSProperties {
  return { width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${L.border}`, background: '#fff', color: L.text, fontSize: 14, boxSizing: 'border-box' }
}

export default function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [biz, setBiz] = useState<Business | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [step, setStep] = useState<'service' | 'date' | 'time' | 'details' | 'done'>('service')
  const [selService, setSelService] = useState<Service | null>(null)
  const [selDate, setSelDate] = useState('')
  const [selTime, setSelTime] = useState('')
  const [slots, setSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null)
  const [weekOf, setWeekOf] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d
  })

  useEffect(() => {
    fetch(`/api/bookings/public?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.business) {
          setBiz(d.business)
          setServices(d.services ?? [])
          if ((d.services ?? []).length === 0) setStep('date')
        }
      })
  }, [slug])

  useEffect(() => {
    if (!biz || !selDate) return
    setSlotsLoading(true)
    setSlots([])
    const p = new URLSearchParams({ business_id: biz.id, date: selDate })
    if (selService) p.set('service_id', selService.id)
    fetch(`/api/bookings/availability?${p}`)
      .then(r => r.json())
      .then(d => { setSlots(d.slots ?? []); setSlotsLoading(false) })
  }, [biz, selDate, selService])

  async function submit() {
    if (!biz || !form.name || !selDate) return
    setSubmitting(true); setError('')
    const res = await fetch('/api/bookings/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: biz.id,
        service_id: selService?.id ?? null,
        customer_name: form.name,
        customer_email: form.email || null,
        customer_phone: form.phone || null,
        booking_date: selDate,
        booking_time: selTime || null,
        notes: form.notes || null,
        party_size: 1,
      }),
    })
    const d = await res.json()
    if (d.booking) { setBooking(d.booking); setStep('done') }
    else setError(d.error || 'Could not create booking. Please try again.')
    setSubmitting(false)
  }

  const today = dateStr(new Date())
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i))

  if (!biz) return (
    <div style={{ minHeight: '100vh', background: L.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif' }}>
      <p style={{ color: L.muted }}>Loading…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: L.bg, fontFamily: 'Inter,sans-serif', padding: '40px 16px' }}>
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: L.dark, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 12 }}>📅</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: L.text, margin: 0 }}>{biz.name}</h1>
          <p style={{ fontSize: 13, color: L.muted, marginTop: 4 }}>Book an appointment online</p>
        </div>

        {/* Progress */}
        {step !== 'done' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
            {(['service', 'date', 'time', 'details'] as const).map((s, i) => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: ['service','date','time','details'].indexOf(step) >= i ? L.dark : L.border }} />
            ))}
          </div>
        )}

        {/* STEP: service */}
        {step === 'service' && (
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: L.text, marginBottom: 14 }}>Select a service</p>
            {services.map(s => (
              <div key={s.id} onClick={() => { setSelService(s); setStep('date') }}
                style={{ background: L.card, borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', border: `2px solid ${selService?.id === s.id ? L.dark : L.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, color: L.text, margin: 0, fontSize: 14 }}>{s.name}</p>
                  <p style={{ fontSize: 12, color: L.muted, margin: '3px 0 0' }}>{s.duration_minutes} min{s.price ? ` · $${s.price}` : ' · Free'}</p>
                  {s.description && <p style={{ fontSize: 12, color: L.muted, margin: '4px 0 0' }}>{s.description}</p>}
                </div>
                <span style={{ color: L.dark, fontSize: 18 }}>›</span>
              </div>
            ))}
            <button onClick={() => { setSelService(null); setStep('date') }} style={{ ...btn(false), marginTop: 8, fontSize: 13 }}>
              No preference — skip
            </button>
          </div>
        )}

        {/* STEP: date */}
        {step === 'date' && (
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: L.text, marginBottom: 14 }}>
              {selService ? `${selService.name} — ` : ''}Choose a date
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setWeekOf(p => addDays(p, -7))} style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', color: L.dark, fontSize: 16 }}>‹</button>
              <span style={{ fontSize: 12, color: L.muted, flex: 1, textAlign: 'center' }}>
                {weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {weekDays[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </span>
              <button onClick={() => setWeekOf(p => addDays(p, 7))} style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', color: L.dark, fontSize: 16 }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 20 }}>
              {weekDays.map(d => {
                const ds = dateStr(d)
                const isPast = ds < today
                const isSel = ds === selDate
                return (
                  <div key={ds} onClick={() => !isPast && setSelDate(ds)}
                    style={{ borderRadius: 10, padding: '10px 4px', textAlign: 'center', cursor: isPast ? 'not-allowed' : 'pointer', background: isSel ? L.dark : L.card, border: `1px solid ${isSel ? L.dark : L.border}`, opacity: isPast ? 0.38 : 1 }}>
                    <p style={{ fontSize: 10, color: isSel ? 'rgba(255,255,255,0.6)' : L.muted, margin: '0 0 4px' }}>{d.toLocaleDateString('en-AU', { weekday: 'narrow' })}</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: isSel ? '#fff' : L.text, margin: 0 }}>{d.getDate()}</p>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {services.length > 0 && <button onClick={() => setStep('service')} style={{ ...btn(false), width: 'auto', padding: '12px 20px' }}>← Back</button>}
              <button onClick={() => selDate && setStep('time')} disabled={!selDate} style={{ ...btn(true), opacity: selDate ? 1 : 0.5 }}>Next →</button>
            </div>
          </div>
        )}

        {/* STEP: time */}
        {step === 'time' && (
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: L.text, marginBottom: 4 }}>Choose a time</p>
            <p style={{ fontSize: 13, color: L.muted, marginBottom: 16 }}>{fmtDate(selDate)}</p>
            {slotsLoading ? (
              <p style={{ color: L.muted, textAlign: 'center', padding: '24px 0' }}>Checking availability…</p>
            ) : slots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ color: L.muted, marginBottom: 12 }}>No available slots on this day.</p>
                <button onClick={() => setStep('date')} style={{ ...btn(false), width: 'auto', padding: '10px 20px' }}>Choose another date</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
                {slots.map(t => (
                  <div key={t} onClick={() => setSelTime(t)}
                    style={{ borderRadius: 10, padding: '12px 6px', textAlign: 'center', cursor: 'pointer', background: selTime === t ? L.dark : L.card, border: `1px solid ${selTime === t ? L.dark : L.border}`, color: selTime === t ? '#fff' : L.text, fontWeight: 600, fontSize: 14 }}>
                    {fmtTime(t)}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setSelTime(''); setStep('date') }} style={{ ...btn(false), width: 'auto', padding: '12px 20px' }}>← Back</button>
              <button onClick={() => selTime && setStep('details')} disabled={!selTime} style={{ ...btn(true), opacity: selTime ? 1 : 0.5 }}>Next →</button>
            </div>
          </div>
        )}

        {/* STEP: details */}
        {step === 'details' && (
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: L.text, marginBottom: 8 }}>Your details</p>
            <div style={{ background: L.card, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: L.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {selService && <span>📋 {selService.name}</span>}
              <span>📅 {fmtDate(selDate)}</span>
              {selTime && <span>🕐 {fmtTime(selTime)}</span>}
            </div>
            {[
              { key: 'name', label: 'Full name *', type: 'text', placeholder: 'Jane Smith' },
              { key: 'email', label: 'Email (confirmation will be sent)', type: 'email', placeholder: 'jane@email.com' },
              { key: 'phone', label: 'Mobile (for SMS reminders)', type: 'tel', placeholder: '0412 345 678' },
              { key: 'notes', label: 'Special requests (optional)', type: 'text', placeholder: 'e.g. wheelchair access, dietary requirements' },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: L.muted, display: 'block', marginBottom: 4 }}>{label}</label>
                <input
                  value={(form as Record<string, string>)[key]}
                  type={type}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={iStyle()}
                  placeholder={placeholder}
                />
              </div>
            ))}
            {error && <p style={{ color: L.red, fontSize: 13, marginBottom: 10 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('time')} style={{ ...btn(false), width: 'auto', padding: '12px 20px' }}>← Back</button>
              <button onClick={submit} disabled={submitting || !form.name} style={{ ...btn(true), opacity: submitting || !form.name ? 0.55 : 1 }}>
                {submitting ? 'Confirming…' : 'Confirm booking'}
              </button>
            </div>
          </div>
        )}

        {/* STEP: done */}
        {step === 'done' && booking && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: `2px solid ${L.green}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 20, color: L.green }}>✓</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: L.text, margin: '0 0 8px' }}>Booking confirmed!</h2>
            <p style={{ fontSize: 14, color: L.muted, marginBottom: 24 }}>
              {form.email ? `A confirmation has been sent to ${form.email}.` : 'Your booking is confirmed.'}
            </p>
            <div style={{ background: L.card, borderRadius: 12, padding: 20, textAlign: 'left', marginBottom: 20, border: `1px solid ${L.border}` }}>
              <p style={{ fontWeight: 600, color: L.text, marginBottom: 10, fontSize: 15 }}>{biz.name}</p>
              {selService && <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>📋 {selService.name}</p>}
              <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>📅 {fmtDate(selDate)}</p>
              {selTime && <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>🕐 {fmtTime(selTime)}</p>}
              <p style={{ fontSize: 13, color: L.muted, margin: '4px 0' }}>👤 {form.name}</p>
            </div>
            {(booking.booking_token as string | null) && (
              <p style={{ fontSize: 13, color: L.muted }}>
                Need to change?{' '}
                <a href={`/book/${slug}/manage?token=${booking.booking_token}`} style={{ color: L.dark, fontWeight: 600 }}>
                  Cancel or reschedule
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
