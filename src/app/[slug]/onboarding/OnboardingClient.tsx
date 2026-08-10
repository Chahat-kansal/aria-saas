'use client'

import { useState, useEffect, useRef } from 'react'
import TurnstileWidget from '@/components/security/TurnstileWidget'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

const inputBase: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid rgba(0,0,0,0.14)',
  borderRadius: 14,
  padding: '14px 16px',
  fontFamily: FB,
  fontSize: 16,
  outline: 'none',
  background: '#fff',
  color: INK,
}

export function OnboardingClient({ slug, bizName, logoUrl }: {
  slug: string
  bizName: string
  logoUrl: string | null
}) {
  const [step, setStep]       = useState<'form' | 'otp'>('form')
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [digits, setDigits]   = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Tick the resend countdown
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // ── Step 1: send OTP ────────────────────────────────────────────────────
  const sendCode = async () => {
    const trimName  = name.trim()
    const trimPhone = phone.trim()
    if (trimName.length < 2) { setErr('Please enter your name'); return }
    if (!trimPhone)           { setErr('Please enter your mobile number'); return }
    setLoading(true); setErr('')
    try {
      const res  = await fetch('/api/cx/' + slug + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone: trimPhone, turnstile_token: turnstileToken }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setDigits(['', '', '', '', '', ''])
        setStep('otp')
        setCountdown(30)
        setTimeout(() => inputRefs.current[0]?.focus(), 80)
      } else {
        setErr(data.error ?? 'Could not send code. Check your number.')
      }
    } catch { setErr('Network error. Try again.') }
    setLoading(false)
  }

  // ── Step 2: verify OTP ──────────────────────────────────────────────────
  const verifyCode = async (code: string) => {
    if (loading) return
    setLoading(true); setErr('')
    try {
      const res  = await fetch('/api/cx/' + slug + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone: phone.trim(), code }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        // ARIA-LOYALTY-AUDIT-1 §3 — honour ?next= so the menu's sign-in gate can bring the customer
        // back to their cart instead of dumping them on the hub with an order they have to rebuild.
        //
        // OPEN-REDIRECT GUARD: only a same-origin ABSOLUTE PATH is accepted. A value starting '//'
        // or '/\' is a protocol-relative URL that browsers resolve to another host, which is how
        // this exact pattern becomes a phishing hop on a page that just took someone's phone number.
        let dest = '/' + slug
        try {
          const next = new URLSearchParams(window.location.search).get('next')
          if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) dest = next
        } catch { /* fall back to the hub */ }
        window.location.replace(dest)
      } else {
        setErr(data.error ?? 'Incorrect code. Try again.')
        setDigits(['', '', '', '', '', ''])
        setTimeout(() => inputRefs.current[0]?.focus(), 40)
      }
    } catch { setErr('Network error. Try again.') }
    setLoading(false)
  }

  const resend = async () => {
    if (countdown > 0 || loading) return
    setErr('')
    setLoading(true)
    try {
      const res  = await fetch('/api/cx/' + slug + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone: phone.trim(), turnstile_token: turnstileToken }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setDigits(['', '', '', '', '', ''])
        setCountdown(30)
        setTimeout(() => inputRefs.current[0]?.focus(), 40)
      } else {
        setErr(data.error ?? 'Could not resend code.')
      }
    } catch { setErr('Network error. Try again.') }
    setLoading(false)
  }

  // ── OTP box event handlers ──────────────────────────────────────────────
  const handleInput = (i: number, value: string) => {
    const clean = value.replace(/\D/g, '')
    // SMS autofill does NOT arrive as a paste. iOS and Android write the WHOLE code into the
    // focused box and fire a normal `input` event, so handlePaste (a ClipboardEvent handler) never
    // sees it. Without this branch the old `.slice(-1)` kept only the LAST digit and the other five
    // boxes stayed empty — autofill would have visibly half-worked. Distributes from the box that
    // received the value, exactly as handlePaste does from box 0.
    if (clean.length > 1) {
      const next = [...digits]
      clean.split('').forEach((d, k) => { if (i + k < 6) next[i + k] = d })
      setDigits(next)
      inputRefs.current[Math.min(i + clean.length, 5)]?.focus()
      if (next.every(d => d !== '')) void verifyCode(next.join(''))
      return
    }
    const digit = clean.slice(-1)
    const next  = [...digits]
    next[i]     = digit
    setDigits(next)
    if (digit && i < 5) inputRefs.current[i + 1]?.focus()
    if (next.every(d => d !== '')) void verifyCode(next.join(''))
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && i > 0)  inputRefs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) inputRefs.current[i + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next   = [...digits]
    pasted.split('').forEach((d, i) => { if (i < 6) next[i] = d })
    setDigits(next)
    const lastIdx = Math.min(pasted.length, 5)
    inputRefs.current[lastIdx]?.focus()
    if (pasted.length === 6) void verifyCode(pasted)
  }

  return (
    <div style={{
      minHeight: '100dvh', background: BG, fontFamily: FB, color: INK,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '0 24px',
    }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* Logo + biz name */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
          background: logoUrl ? ('url(' + logoUrl + ') center/cover no-repeat #f0ede8') : '#f0ede8',
          border: '2px solid rgba(0,0,0,0.08)',
        }} />
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 32, margin: '0 0 4px', color: INK }}>
          {bizName}
        </h1>
        <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
          {step === 'form' ? 'Join to earn rewards' : 'Enter the code we sent you'}
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 360 }}>

        {step === 'form' && (
          <>
            <label style={{ fontFamily: FB, fontSize: 12, fontWeight: 700, color: INK_MUTED, display: 'block', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void sendCode() }}
              placeholder="First name"
              autoComplete="given-name"
              style={{ ...inputBase, marginBottom: 14 }}
            />

            <label style={{ fontFamily: FB, fontSize: 12, fontWeight: 700, color: INK_MUTED, display: 'block', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Mobile number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void sendCode() }}
              placeholder="04xx xxx xxx"
              autoComplete="tel"
              style={{ ...inputBase, marginBottom: 14 }}
            />

            {err && (
              <p style={{ fontFamily: FB, fontSize: 14, color: '#dc2626', textAlign: 'center', margin: '0 0 12px' }}>
                {err}
              </p>
            )}

            <div style={{ marginBottom: 14 }}>
              <TurnstileWidget onToken={setTurnstileToken} theme="light" />
            </div>

            <button
              onClick={() => void sendCode()}
              disabled={loading || name.trim().length < 2 || !phone.trim()}
              style={{
                width: '100%', background: ACCENT, color: ACCENT_TEXT, border: 'none',
                borderRadius: 14, padding: '16px', fontFamily: FB, fontSize: 16, fontWeight: 700,
                cursor: loading || name.trim().length < 2 || !phone.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || name.trim().length < 2 || !phone.trim() ? 0.6 : 1,
                boxShadow: '0 0 24px rgba(217,245,78,0.4)',
              }}
            >
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, textAlign: 'center', margin: '0 0 24px' }}>
              {'Code sent to ' + phone.trim()}
            </p>

            {/* 6 OTP boxes */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  // Split six-box layout: one-time-code goes on the FIRST box ONLY. Browsers fill
                  // that field and distribute the rest; setting it on all six makes some browsers
                  // write the whole code into every box.
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  // Box 0 must be able to HOLD the whole code for autofill to land it — maxLength
                  // truncates an autofilled value the same way it truncates typing. The other five
                  // keep 2, which is what makes type-over work with the slice(-1) path above.
                  maxLength={i === 0 ? 6 : 2}
                  value={d}
                  disabled={loading}
                  onChange={e => handleInput(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  onFocus={e => e.target.select()}
                  style={{
                    width: 48, height: 60, textAlign: 'center',
                    fontFamily: FB, fontSize: 24, fontWeight: 700,
                    border: d ? '2px solid ' + ACCENT : '2px solid rgba(0,0,0,0.18)',
                    borderRadius: 12, background: '#fff', color: INK,
                    outline: 'none', boxShadow: d ? '0 0 0 3px rgba(217,245,78,0.25)' : 'none',
                    opacity: loading ? 0.6 : 1,
                  }}
                />
              ))}
            </div>

            {err && (
              <p style={{ fontFamily: FB, fontSize: 14, color: '#dc2626', textAlign: 'center', margin: '0 0 14px' }}>
                {err}
              </p>
            )}

            {loading && (
              <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, textAlign: 'center', margin: '0 0 14px' }}>
                Verifying…
              </p>
            )}

            {/* Turnstile tokens are single-use — a fresh widget instance here (vs. reusing the
                form-step one) is what gives `resend` a valid token instead of a stale/consumed one. */}
            <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
              <TurnstileWidget onToken={setTurnstileToken} theme="light" />
            </div>

            {/* Resend row */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => void resend()}
                disabled={countdown > 0 || loading}
                style={{
                  background: 'none', border: 'none', fontFamily: FB, fontSize: 14,
                  color: countdown > 0 ? INK_MUTED : ACCENT_TEXT,
                  cursor: countdown > 0 ? 'default' : 'pointer',
                  fontWeight: 600, padding: 0, textDecoration: countdown > 0 ? 'none' : 'underline',
                }}
              >
                {countdown > 0 ? ('Resend in ' + countdown + 's') : 'Resend code'}
              </button>
              <span style={{ color: INK_MUTED, fontFamily: FB, fontSize: 14 }}>·</span>
              <button
                onClick={() => { setStep('form'); setErr(''); setDigits(['', '', '', '', '', '']) }}
                style={{ background: 'none', border: 'none', fontFamily: FB, fontSize: 14, color: INK_MUTED, cursor: 'pointer', padding: 0 }}
              >
                Change number
              </button>
            </div>
          </>
        )}
      </div>

      <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, textAlign: 'center', marginTop: 40, maxWidth: 300, lineHeight: 1.6 }}>
        {'By joining you agree to receive updates from ' + bizName + '. You can opt out anytime.'}
      </p>
    </div>
  )
}