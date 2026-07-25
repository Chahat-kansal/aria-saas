'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TurnstileWidget from '@/components/security/TurnstileWidget'

// Locked Pipel design — light ink-on-cream, hard 1.5px borders, Cormorant + Outfit.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = "var(--font-body, 'Outfit', system-ui, sans-serif)"
const DISPLAY = "var(--font-display, 'Cormorant', Georgia, serif)"

interface Biz { id: string; name: string; industry: string | null; suburb: string | null; logo_url: string | null; slug: string | null }
type Step = 'email' | 'pin' | 'code' | 'setpin'

export default function LoyaltyEntryPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [businesses, setBusinesses] = useState<Biz[] | null>(null)

  // Identity-first sign-in — EMAIL (PIN) or PHONE (SMS code). All actions are business-agnostic.
  const [step, setStep] = useState<Step>('email')
  const [mode, setMode] = useState<'login' | 'join' | 'forgot'>('login')
  const [channel, setChannel] = useState<'email' | 'phone'>('email')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')

  useEffect(() => {
    const browse = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('browse')
    fetch('/api/loyalty/directory').then(r => r.json()).then(d => setBusinesses((d.businesses ?? []) as Biz[])).catch(() => setBusinesses([]))
    fetch('/api/loyalty/auth').then(r => r.json()).then(d => {
      if (d?.identity) {
        if (!browse) { router.replace('/loyalty/wallet'); return }
        setSignedIn(true)
      }
      setReady(true)
    }).catch(() => setReady(true))
  }, [router])

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/loyalty/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    return { ok: r.ok, d: await r.json().catch(() => ({})) }
  }
  const toWallet = () => router.replace('/loyalty/wallet')

  const continueEmail = async () => {
    setError('')
    if (channel === 'phone') {
      if (!/^(\+?61|0)?4\d{8}$/.test(phone.replace(/\s/g, ''))) { setError('Enter a valid Australian mobile (04xx xxx xxx).'); return }
      setBusy(true)
      const { ok, d } = await post({ action: 'send-code', phone, turnstile_token: turnstileToken })
      setBusy(false)
      if (!ok || d.error) { setError(d.error || 'Could not send your code.'); return }
      setInfo(`We've texted a 6-digit code to ${phone}.`); setStep('code')
      return
    }
    if (!email.includes('@')) { setError('Enter a valid email.'); return }
    if (mode === 'login') { setStep('pin'); return }
    setBusy(true)
    const { d } = await post({ action: 'send-code', email, turnstile_token: turnstileToken })
    setBusy(false)
    if (d.error) { setError(d.error); return }
    setInfo(`We've emailed a 6-digit code to ${email}.`); setStep('code')
  }
  const doLogin = async () => {
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('Enter your 6-digit PIN.'); return }
    setBusy(true)
    const { ok, d } = await post({ action: 'login', email, pin })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'Sign-in failed.'); setPin(''); return }
    toWallet()
  }
  const verifyCode = async () => {
    setError('')
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return }
    setBusy(true)
    const { ok, d } = await post(channel === 'phone' ? { action: 'verify', phone, code } : { action: 'verify', email, code })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'That code is incorrect or expired.'); return }
    if (d.signed_in) { toWallet(); return } // phone: OTP signs in directly (no PIN)
    setStep('setpin') // email: continue to set a PIN
  }
  const setPinSubmit = async () => {
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('Choose a 6-digit PIN.'); return }
    if (pin !== confirm) { setError('The two PINs don’t match.'); return }
    setBusy(true)
    const { ok, d } = await post({ action: 'set-pin', email, pin })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'Could not set your PIN.'); return }
    toWallet()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: BORDER, background: SURFACE, color: INK, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: FONT }
  const pinInp: React.CSSProperties = { ...inp, fontSize: 22, letterSpacing: 8, textAlign: 'center' }
  const btn: React.CSSProperties = { height: 48, borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT }
  const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: INK, textDecoration: 'underline', cursor: 'pointer', fontSize: 13, fontFamily: FONT, padding: '6px 2px' }
  const lbl: React.CSSProperties = { fontSize: 12, color: INK_SOFT, fontWeight: 600 }
  const card: React.CSSProperties = { background: SURFACE, border: BORDER, borderRadius: 18, padding: 22, boxShadow: '4px 4px 0 #0a0a0a' }

  const signIn = (
    <div style={card}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', fontFamily: DISPLAY, fontStyle: 'italic' }}>Sign in to my rewards</h2>
      <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 16px' }}>One login for every Aria business.</p>

      {step === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Email or phone — customer's choice */}
          <div role="tablist" aria-label="Sign-in method" style={{ display: 'flex', gap: 8 }}>
            {(['email', 'phone'] as const).map(c => (
              <button key={c} role="tab" aria-selected={channel === c} onClick={() => { setChannel(c); setError('') }}
                style={{ flex: 1, height: 44, borderRadius: 10, border: BORDER, background: channel === c ? ACCENT : SURFACE, color: INK, fontWeight: channel === c ? 700 : 500, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}>
                {c === 'email' ? 'Email' : 'Phone'}
              </button>
            ))}
          </div>

          <TurnstileWidget onToken={setTurnstileToken} theme="light" />

          {channel === 'phone' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="loy-phone" style={lbl}>Mobile number</label>
              <input id="loy-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="04xx xxx xxx" style={inp} />
              {error && <p style={{ color: '#d11', fontSize: 13, margin: '4px 0 0' }}>{error}</p>}
              <button onClick={continueEmail} disabled={busy} style={{ ...btn, marginTop: 4, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Text me a code →'}</button>
              <p style={{ fontSize: 11, color: INK_SOFT, textAlign: 'center', margin: 0 }}>We&apos;ll send a one-time SMS code. No PIN needed.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="loy-email" style={lbl}>Email</label>
              <input id="loy-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" style={inp} />
              {error && <p style={{ color: '#d11', fontSize: 13, margin: '4px 0 0' }}>{error}</p>}
              <button onClick={continueEmail} disabled={busy} style={{ ...btn, marginTop: 4, opacity: busy ? 0.6 : 1 }}>{busy ? 'Please wait…' : 'Continue →'}</button>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {mode === 'login'
                  ? <button style={linkBtn} onClick={() => { setMode('join'); setError('') }}>First time? Join</button>
                  : <button style={linkBtn} onClick={() => { setMode('login'); setError('') }}>Have a PIN? Sign in</button>}
                <button style={linkBtn} onClick={() => { setMode('forgot'); setError(''); if (email.includes('@')) continueEmail() }}>Forgot PIN?</button>
              </div>
            </div>
          )}
        </div>
      )}
      {step === 'pin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 15, margin: 0 }}>Welcome back — enter your PIN.</p>
          <input inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={pinInp} />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={doLogin} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Signing in…' : 'Sign in →'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button style={linkBtn} onClick={() => { setStep('email'); setPin('') }}>← Back</button>
            <button style={linkBtn} onClick={() => { setMode('forgot'); continueEmail() }}>Forgot PIN?</button>
          </div>
        </div>
      )}
      {step === 'code' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {info && <p style={{ fontSize: 14, color: INK_SOFT, margin: 0 }}>{info}</p>}
          <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" style={pinInp} />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={verifyCode} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Checking…' : 'Verify →'}</button>
          <button style={linkBtn} onClick={() => { setStep('email'); setCode('') }}>← Back</button>
        </div>
      )}
      {step === 'setpin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 15, margin: 0 }}>Choose a 6-digit PIN.</p>
          <input inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={pinInp} />
          <input inputMode="numeric" maxLength={6} value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="Confirm PIN" style={pinInp} />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={setPinSubmit} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Set PIN & continue →'}</button>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, textAlign: 'center', margin: '0 0 6px', fontFamily: DISPLAY, fontStyle: 'italic' }}>Aria Rewards</h1>
          <p style={{ textAlign: 'center', color: INK_SOFT, fontSize: 15, margin: 0, lineHeight: 1.5 }}>One login for your rewards across every Aria business.</p>
        </div>

        {/* Always-present sign-in (signed-out only) */}
        {ready && !signedIn && signIn}

        {/* Discovery — join a business */}
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '6px 0 10px', textAlign: 'center' }}>Join a business</p>
          {businesses === null ? (
            <p style={{ textAlign: 'center', color: INK_SOFT }}>Loading…</p>
          ) : businesses.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 20 }}>
              <p style={{ color: INK_SOFT, margin: 0 }}>No businesses have opened public sign-up yet. You can still sign in above.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {businesses.map(b => (
                <a key={b.id} href={`/loyalty/${b.slug || b.id}/signin`} style={{ textDecoration: 'none', color: INK }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: SURFACE, border: BORDER, borderRadius: 16, padding: 16, boxShadow: '3px 3px 0 #0a0a0a' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, border: BORDER, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 800, fontSize: 22 }}>
                      {b.logo_url ? <img src={b.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (b.name?.[0] ?? '★')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{b.name}</p>
                      {(b.industry || b.suburb) && <p style={{ fontSize: 13, color: INK_SOFT, margin: '2px 0 0' }}>{[b.industry, b.suburb].filter(Boolean).join(' · ')}</p>}
                    </div>
                    <span style={{ fontSize: 18, color: INK_SOFT }}>→</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: INK_SOFT }}>Powered by Aria</div>
      </div>
    </div>
  )
}
