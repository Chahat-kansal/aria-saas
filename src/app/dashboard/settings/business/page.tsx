'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '20px 22px' }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '1px solid var(--divider)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }

const isValidReviewLink = (v: string) => v === '' || /google\.com\/maps|g\.page\/r|search\.google\.com\/local\/writereview|maps\.app\.goo\.gl/i.test(v)

export default function BusinessHubSettingsPage() {
  const { business } = useBusinessContext()
  const [reviewLink, setReviewLink] = useState('')
  const [bookingSlug, setBookingSlug] = useState('')
  const [slug, setSlug] = useState('')
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
        body: JSON.stringify({ google_review_link: reviewLink.trim(), booking_link_slug: bookingSlug.trim() || slug }),
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
            <label style={lbl}>Google review link</label>
            <input style={inp} value={reviewLink} onChange={e => setReviewLink(e.target.value)} placeholder="https://g.page/r/... or https://www.google.com/maps/..." />
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 }}>Paste the &quot;leave a review&quot; link from your Google Business Profile. The Reviews card only shows once this is set.</p>
          </div>

          <div style={card}>
            <label style={lbl}>Booking link slug</label>
            <input style={inp} value={bookingSlug} onChange={e => setBookingSlug(e.target.value)} placeholder={slug || 'your-shop'} />
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 }}>Your booking page will be <code style={{ color: 'var(--text-secondary)' }}>ariaos.site/book/{effectiveBooking || 'your-shop'}</code>. Defaults to your hub slug.</p>
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
