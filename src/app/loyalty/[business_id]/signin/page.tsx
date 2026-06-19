'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

// Locked Pipel design — light ink-on-cream, hard 1.5px borders, Inter.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = 'Inter, system-ui, -apple-system, sans-serif'

type Step = 'loading' | 'email' | 'pin' | 'code' | 'setpin' | 'landing'

export default function LoyaltySignInPage() {
  const params = useParams()
  const bid = params?.business_id as string
  const [bizName, setBizName] = useState('Rewards')
  const [step, setStep] = useState<Step>('loading')
  const [mode, setMode] = useState<'login' | 'join' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [welcome, setWelcome] = useState<string | null>(null)

  useEffect(() => {
    if (!bid) return
    fetch(`/api/public/loyalty/${bid}`).then(r => r.json()).then(d => { if (d?.business?.name) setBizName(d.business.name) }).catch(() => {})
    // Same-device session → straight to landing.
    fetch('/api/loyalty/auth').then(r => r.json()).then(d => {
      if (d?.customer) { setWelcome(d.customer.name ?? null); setStep('landing') } else setStep('email')
    }).catch(() => setStep('email'))
  }, [bid])

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/loyalty/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    return { ok: r.ok, d: await r.json().catch(() => ({})) }
  }

  const continueEmail = async () => {
    setError('')
    if (!email.includes('@')) { setError('Enter a valid email.'); return }
    if (mode === 'login') { setStep('pin'); return }
    // join / forgot → send a code
    setBusy(true)
    const { d } = await post({ action: 'send-code', business_id: bid, email })
    setBusy(false)
    if (d.error) { setError(d.error); return }
    setInfo(`We've emailed a 6-digit code to ${email}.`); setStep('code')
  }

  const doLogin = async () => {
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('Enter your 6-digit PIN.'); return }
    setBusy(true)
    const { ok, d } = await post({ action: 'login', business_id: bid, email, pin })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'Sign-in failed.'); setPin(''); return }
    setWelcome(d.name ?? null); setStep('landing')
  }

  const verifyCode = async () => {
    setError('')
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return }
    setBusy(true)
    const { ok, d } = await post({ action: 'verify', business_id: bid, email, code })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'That code is incorrect or expired.'); return }
    setStep('setpin')
  }

  const setPinSubmit = async () => {
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('Choose a 6-digit PIN.'); return }
    if (pin !== confirm) { setError('The two PINs don’t match.'); return }
    setBusy(true)
    const { ok, d } = await post({ action: 'set-pin', business_id: bid, email, pin, name: mode === 'join' ? name : undefined })
    setBusy(false)
    if (!ok || d.error) { setError(d.error || 'Could not set your PIN.'); return }
    setWelcome(d.name ?? null); setStep('landing')
  }

  const logout = async () => {
    await post({ action: 'logout' })
    setEmail(''); setPin(''); setConfirm(''); setCode(''); setWelcome(null); setMode('login'); setStep('email')
  }

  const card: React.CSSProperties = { background: SURFACE, border: BORDER, borderRadius: 22, padding: 28, boxShadow: '4px 4px 0 #0a0a0a' }
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: BORDER, background: SURFACE, color: INK, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: FONT }
  const pinInp: React.CSSProperties = { ...inp, fontSize: 22, letterSpacing: 8, textAlign: 'center' }
  const btn: React.CSSProperties = { height: 48, borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT }
  const link: React.CSSProperties = { background: 'none', border: 'none', color: INK, textDecoration: 'underline', cursor: 'pointer', fontSize: 13, fontFamily: FONT, padding: 0 }

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', margin: '0 0 18px', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>{bizName} Rewards</h1>
        {children}
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: INK_SOFT }}>Powered by Aria</div>
      </div>
    </div>
  )

  if (step === 'loading') return wrap(<p style={{ textAlign: 'center', color: INK_SOFT }}>Loading…</p>)

  if (step === 'landing') return wrap(
    <div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>👋</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Welcome{welcome ? `, ${welcome.split(' ')[0]}` : ' back'}!</h2>
      <p style={{ color: INK_SOFT, fontSize: 15, lineHeight: 1.5, margin: '0 0 18px' }}>You&apos;re signed in to your {bizName} rewards. Your full dashboard is coming soon.</p>
      <button onClick={logout} style={{ ...link }}>Sign out</button>
    </div>
  )

  return wrap(
    <div style={card}>
      {step === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 13, color: INK_SOFT }}>{mode === 'login' ? 'Sign in with your email' : mode === 'join' ? 'Join with your email' : 'Reset your PIN'}</label>
          {mode === 'join' && <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" style={inp} />}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" style={inp} />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={continueEmail} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Please wait…' : 'Continue →'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {mode === 'login'
              ? <button style={link} onClick={() => { setMode('join'); setError('') }}>First time? Join</button>
              : <button style={link} onClick={() => { setMode('login'); setError('') }}>Have a PIN? Sign in</button>}
            <button style={link} onClick={() => { setMode('forgot'); setError(''); if (email.includes('@')) continueEmail() }}>Forgot PIN?</button>
          </div>
        </div>
      )}

      {step === 'pin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 15, margin: 0 }}>Welcome back — enter your PIN.</p>
          <input inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={pinInp} aria-label="PIN" />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={doLogin} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Signing in…' : 'Sign in →'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button style={link} onClick={() => { setStep('email'); setPin('') }}>← Back</button>
            <button style={link} onClick={() => { setMode('forgot'); continueEmail() }}>Forgot PIN?</button>
          </div>
        </div>
      )}

      {step === 'code' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {info && <p style={{ fontSize: 14, color: INK_SOFT, margin: 0 }}>{info}</p>}
          <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" style={pinInp} aria-label="Email code" />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={verifyCode} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Checking…' : 'Verify →'}</button>
          <button style={link} onClick={() => { setStep('email'); setCode('') }}>← Back</button>
        </div>
      )}

      {step === 'setpin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 15, margin: 0 }}>Choose a 6-digit PIN.</p>
          <input inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={pinInp} aria-label="New PIN" />
          <input inputMode="numeric" maxLength={6} value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="Confirm PIN" style={pinInp} aria-label="Confirm PIN" />
          {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={setPinSubmit} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Set PIN & sign in →'}</button>
        </div>
      )}
    </div>
  )
}
