'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '20px 22px' }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '1px solid var(--divider)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }

const isValidReviewLink = (v: string) => v === '' || /google\.com\/maps|g\.page\/r|search\.google\.com\/local\/writereview|maps\.app\.goo\.gl/i.test(v)

export default function BusinessHubSettingsPage() {
  const { business } = useBusinessContext()
  const [reviewLink, setReviewLink] = useState('')
  const [bookingSlug, setBookingSlug] = useState('')
  const [slug, setSlug] = useState('')
  const [weeklyTarget, setWeeklyTarget] = useState('')
  const [address, setAddress] = useState({ address: '', city: '', business_state: '', postcode: '', lat: '', lng: '', place_id: '', formatted_address: '' })
  const [manualAddress, setManualAddress] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!business?.id) return
    fetch('/api/settings/business').then(r => r.json()).then(d => {
      if (d.business) {
        setReviewLink(d.business.google_review_link ?? '')
        setBookingSlug(d.business.booking_link_slug ?? '')
        setSlug(d.business.slug ?? '')
        setWeeklyTarget(d.business.weekly_revenue_target != null && Number(d.business.weekly_revenue_target) > 0 ? String(d.business.weekly_revenue_target) : '')
        setAddress({
          address: d.business.address ?? '',
          city: d.business.city ?? '',
          business_state: d.business.business_state ?? '',
          postcode: d.business.postcode ?? '',
          lat: d.business.lat != null ? String(d.business.lat) : '',
          lng: d.business.lng != null ? String(d.business.lng) : '',
          place_id: d.business.place_id ?? '',
          formatted_address: d.business.formatted_address ?? '',
        })
        setManualAddress(!!d.business.address && d.business.lat == null)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [business?.id])

  async function save() {
    setError(''); setMsg('')
    if (!isValidReviewLink(reviewLink.trim())) {
      setError('That doesn\'t look like a Google review link — it should contain google.com/maps or g.page/r.')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/settings/business', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_review_link: reviewLink.trim(), booking_link_slug: bookingSlug.trim() || slug,
          weekly_revenue_target: weeklyTarget.trim() === '' ? 0 : Number(weeklyTarget),
          address: address.address, city: address.city, business_state: address.business_state, postcode: address.postcode,
          lat: address.lat || null, lng: address.lng || null, place_id: address.place_id || null, formatted_address: address.formatted_address || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Save failed')
      setMsg('Saved'); setTimeout(() => setMsg(''), 2200)
    } catch (e) { setError((e as Error).message) }
    setSaving(false)
  }

  if (!business) return null
  const effectiveBooking = (bookingSlug.trim() || slug)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px', fontFamily: "'Manrope', system-ui, sans-serif", color: 'var(--text-primary)' }}>
      <Link href="/dashboard/share" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>← Back to Share</Link>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 4px' }}>Customer hub links</h1>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 22px' }}>Set these so the matching cards appear on your customer hub at ariaos.site/{slug || 'your-shop'}.</p>

      {loading ? <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <label style={lbl}>Business address</label>
            {manualAddress ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input style={inp} value={address.address} onChange={e => setAddress(a => ({ ...a, address: e.target.value }))} placeholder="Street address" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input style={inp} value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} placeholder="Suburb" />
                  <input style={inp} value={address.business_state} onChange={e => setAddress(a => ({ ...a, business_state: e.target.value }))} placeholder="State" />
                </div>
                <input style={inp} value={address.postcode} onChange={e => setAddress(a => ({ ...a, postcode: e.target.value }))} placeholder="Postcode" />
                <button type="button" onClick={() => setManualAddress(false)} style={{ fontSize: 12, color: 'var(--violet)', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  Use address lookup instead
                </button>
              </div>
            ) : (
              <AddressAutocomplete
                initialValue={address.formatted_address || address.address}
                onManualEntry={() => setManualAddress(true)}
                onSelect={a => setAddress({
                  address: a.address_line1, city: a.suburb, business_state: a.state, postcode: a.postcode,
                  lat: a.lat !== null ? String(a.lat) : '', lng: a.lng !== null ? String(a.lng) : '',
                  place_id: a.place_id ?? '', formatted_address: a.formatted,
                })}
              />
            )}
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 }}>Used on receipts, your customer hub locations page, and Google/SEO listings.</p>
          </div>

          <div style={card}>
            <label style={lbl}>Google review link</label>
            <input style={inp} value={reviewLink} onChange={e => setReviewLink(e.target.value)} placeholder="https://g.page/r/... or https://www.google.com/maps/..." />
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 }}>Paste the &quot;leave a review&quot; link from your Google Business Profile. The Reviews card only shows once this is set.</p>
          </div>

          <div style={card}>
            <label style={lbl}>Booking link slug</label>
            <input style={inp} value={bookingSlug} onChange={e => setBookingSlug(e.target.value)} placeholder={slug || 'your-shop'} />
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 }}>Your booking page will be <code style={{ color: 'var(--text-secondary)' }}>ariaos.site/book/{effectiveBooking || 'your-shop'}</code>. Defaults to your hub slug.</p>
          </div>

          <div style={card}>
            <label style={lbl}>Weekly revenue target</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-tertiary)', pointerEvents: 'none' }}>$</span>
              <input
                style={{ ...inp, paddingLeft: 24 }}
                type="number" min={0} max={9999999} step={50} inputMode="decimal"
                value={weeklyTarget}
                onChange={e => setWeeklyTarget(e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 }}>Aria uses this to track progress and alert you when you&apos;re falling behind. Leave blank or 0 to turn target tracking off.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={save} disabled={saving} style={{ height: 42, padding: '0 20px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            {msg && <span style={{ fontSize: 13, color: '#1D9E75', fontWeight: 600 }}>✓ {msg}</span>}
            {error && <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
