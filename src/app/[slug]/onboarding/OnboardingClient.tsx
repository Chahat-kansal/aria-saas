'use client'

import { useState, useEffect } from 'react'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

export function OnboardingClient({ slug, bizName, logoUrl }: {
  slug: string
  bizName: string
  logoUrl: string | null
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aria_cx_' + slug)
      if (saved) {
        const parsed = JSON.parse(saved) as { phone?: string }
        if (parsed.phone) window.location.replace('/' + slug)
      }
    } catch { /* ok */ }
  }, [slug])

  const submit = async () => {
    if (loading) return
    const trimName = name.trim()
    const trimPhone = phone.trim()
    if (trimName.length < 2) { setErr('Please enter your name (at least 2 characters)'); return }
    if (!trimPhone) { setErr('Please enter your mobile number'); return }
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/public/cx/' + slug + '/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimName, phone: trimPhone }),
      })
      const data = await res.json() as { ok?: boolean; phone?: string; error?: string }
      if (data.ok && data.phone) {
        try { localStorage.setItem('aria_cx_' + slug, JSON.stringify({ phone: data.phone })) } catch { /* ok */ }
        window.location.replace('/' + slug)
      } else {
        setErr(data.error ?? 'Could not create account. Check your number and try again.')
      }
    } catch {
      setErr('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: BG, fontFamily: FB, color: INK,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '0 24px',
    }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', margin: '0 auto 18px',
          background: logoUrl
            ? ('url(' + logoUrl + ') center/cover no-repeat #f0ede8')
            : '#f0ede8',
          border: '2px solid rgba(0,0,0,0.08)',
        }} />
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 34, margin: '0 0 6px', color: INK }}>
          {bizName}
        </h1>
        <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
          Join to earn rewards
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 360 }}>
        <label style={{ fontFamily: FB, fontSize: 12, fontWeight: 600, color: INK_MUTED, display: 'block', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Your name
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void submit() }}
          placeholder="First name"
          autoComplete="given-name"
          style={{
            width: '100%', border: '1.5px solid rgba(0,0,0,0.14)', borderRadius: 14,
            padding: '14px 16px', fontFamily: FB, fontSize: 16, outline: 'none',
            background: '#fff', color: INK, marginBottom: 14,
          }}
        />

        <label style={{ fontFamily: FB, fontSize: 12, fontWeight: 600, color: INK_MUTED, display: 'block', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Mobile number
        </label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void submit() }}
          placeholder="04xx xxx xxx"
          autoComplete="tel"
          style={{
            width: '100%', border: '1.5px solid rgba(0,0,0,0.14)', borderRadius: 14,
            padding: '14px 16px', fontFamily: FB, fontSize: 16, outline: 'none',
            background: '#fff', color: INK, marginBottom: 14,
          }}
        />

        {err && (
          <p style={{ fontFamily: FB, fontSize: 14, color: '#dc2626', textAlign: 'center', margin: '0 0 12px' }}>
            {err}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={loading || name.trim().length < 2 || !phone.trim()}
          style={{
            width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none',
            borderRadius: 14, padding: '16px', fontFamily: FB, fontSize: 16, fontWeight: 700,
            cursor: loading || name.trim().length < 2 || !phone.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || name.trim().length < 2 || !phone.trim() ? 0.6 : 1,
            boxShadow: '0 0 24px rgba(217,245,78,0.4)',
          }}
        >
          {loading ? 'Joining…' : 'Join & earn rewards'}
        </button>
      </div>

      <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, textAlign: 'center', marginTop: 40, maxWidth: 300, lineHeight: 1.6 }}>
        {'By joining you agree to receive updates from ' + bizName + '. You can opt out anytime.'}
      </p>
    </div>
  )
}