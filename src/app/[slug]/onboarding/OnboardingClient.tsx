'use client'

import { useState, useEffect } from 'react'

const BG = '#fafafa'
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
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aria_cx_' + slug)
      if (saved) {
        const parsed = JSON.parse(saved) as { phone?: string }
        if (parsed.phone) window.location.replace('/' + slug)
      }
    } catch { /* ok */ }
  }, [slug])

  const sendCode = async () => {
    if (loading) return
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/loyalty/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-code', phone: phone.trim() }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setStep('otp')
      } else {
        setMsg(data.error ?? 'Failed to send code. Check your number and try again.')
      }
    } catch {
      setMsg('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async () => {
    if (loading) return
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/loyalty/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone: phone.trim(), code: otp }),
      })
      const data = await res.json() as { ok?: boolean; signed_in?: boolean; error?: string }
      if (data.ok && data.signed_in) {
        try { localStorage.setItem('aria_cx_' + slug, JSON.stringify({ phone: phone.trim() })) } catch { /* ok */ }
        window.location.replace('/' + slug)
      } else {
        setMsg(data.error ?? 'Incorrect code. Try again.')
      }
    } catch {
      setMsg('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: BG, fontFamily: FB, color: INK,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '0 24px',
    }}>
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
          {step === 'phone' ? 'Sign in to earn rewards' : 'Enter the code we sent you'}
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 360 }}>
        {step === 'phone' ? (
          <>
            <label style={{ fontFamily: FB, fontSize: 12, fontWeight: 600, color: INK_MUTED, display: 'block', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Mobile number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && phone.trim()) void sendCode() }}
              placeholder="04xx xxx xxx"
              style={{
                width: '100%', border: '1.5px solid rgba(0,0,0,0.14)', borderRadius: 14,
                padding: '14px 16px', fontFamily: FB, fontSize: 16, outline: 'none',
                background: '#fff', color: INK, boxSizing: 'border-box', marginBottom: 12,
              }}
            />
            <button
              onClick={() => void sendCode()}
              disabled={loading || !phone.trim()}
              style={{
                width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none',
                borderRadius: 14, padding: '16px', fontFamily: FB, fontSize: 16, fontWeight: 700,
                cursor: loading || !phone.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !phone.trim() ? 0.6 : 1,
                boxShadow: '0 0 24px rgba(217,245,78,0.4)',
              }}
            >
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, textAlign: 'center', marginBottom: 20 }}>
              {'Sent to ' + phone}
            </p>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter' && otp.length === 6) void verifyCode() }}
              placeholder="000000"
              style={{
                width: '100%', border: '1.5px solid rgba(0,0,0,0.14)', borderRadius: 14,
                padding: '14px 16px', fontFamily: FB, fontSize: 28, fontWeight: 700,
                letterSpacing: '0.25em', outline: 'none', background: '#fff', color: INK,
                textAlign: 'center', boxSizing: 'border-box', marginBottom: 12,
              }}
            />
            <button
              onClick={() => void verifyCode()}
              disabled={loading || otp.length < 6}
              style={{
                width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none',
                borderRadius: 14, padding: '16px', fontFamily: FB, fontSize: 16, fontWeight: 700,
                cursor: loading || otp.length < 6 ? 'not-allowed' : 'pointer',
                opacity: loading || otp.length < 6 ? 0.6 : 1,
                boxShadow: '0 0 24px rgba(217,245,78,0.4)',
              }}
            >
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              onClick={() => { setStep('phone'); setOtp(''); setMsg('') }}
              style={{
                width: '100%', background: 'none', border: 'none', marginTop: 12,
                fontFamily: FB, fontSize: 14, color: INK_MUTED, cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Change number
            </button>
          </>
        )}
        {msg && (
          <p style={{ fontFamily: FB, fontSize: 14, color: '#dc2626', textAlign: 'center', marginTop: 12 }}>
            {msg}
          </p>
        )}
      </div>

      <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, textAlign: 'center', marginTop: 48, maxWidth: 300, lineHeight: 1.6 }}>
        By signing in you agree to receive SMS updates. Standard rates apply.
      </p>
    </div>
  )
}