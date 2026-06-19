'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

// Locked Pipel design — light ink-on-cream, hard 1.5px borders, Inter.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = 'Inter, system-ui, -apple-system, sans-serif'

type Step = 'loading' | 'email' | 'pin' | 'code' | 'setpin' | 'landing'

interface Activity { type: string; points_delta: number; stamps_delta: number; reward_redeemed: string | null; created_at: string }
interface DashData {
  customer: { name: string | null }
  program_type: 'points' | 'stamps'
  points: { balance: number; dollar_value: number; point_value_cents: number }
  stamps: { count: number; target: number; remaining: number; reward_text: string }
  tier: { current_label: string; current_color: string; multiplier: number; next_label: string | null; progress_pct: number; to_next_spend: number } | null
  reward_available: { available: boolean; text?: string; dollars?: number }
  activity: Activity[]
  empty: boolean
}

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
  const [dash, setDash] = useState<DashData | null>(null)

  useEffect(() => {
    if (!bid) return
    fetch(`/api/public/loyalty/${bid}`).then(r => r.json()).then(d => { if (d?.business?.name) setBizName(d.business.name) }).catch(() => {})
    // Same-device session → straight to landing.
    fetch('/api/loyalty/auth').then(r => r.json()).then(d => {
      if (d?.customer) { setWelcome(d.customer.name ?? null); setStep('landing') } else setStep('email')
    }).catch(() => setStep('email'))
  }, [bid])

  // Load the read-only dashboard whenever we land (own-row only; server scopes via the session).
  useEffect(() => {
    if (step !== 'landing') return
    setDash(null)
    fetch('/api/loyalty/dashboard').then(r => r.json()).then(d => { if (d?.customer) setDash(d as DashData) }).catch(() => {})
  }, [step])

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

  if (step === 'landing') {
    const bar = (pct: number) => (
      <div style={{ height: 10, borderRadius: 999, border: BORDER, background: SURFACE, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: ACCENT }} />
      </div>
    )
    const header = (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Hi{welcome ? `, ${welcome.split(' ')[0]}` : ''} 👋</h2>
        <button onClick={logout} style={link}>Sign out</button>
      </div>
    )
    if (!dash) return wrap(<div style={card}>{header}<p style={{ textAlign: 'center', color: INK_SOFT, margin: '12px 0' }}>Loading your rewards…</p></div>)

    const isStamps = dash.program_type === 'stamps'
    const reward = dash.reward_available

    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={card}>
          {header}

          {/* HERO — visible progress */}
          {isStamps ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 12px' }}>Your stamp card</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
                {Array.from({ length: dash.stamps.target }).map((_, i) => (
                  <div key={i} style={{ width: 38, height: 38, borderRadius: '50%', border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i < dash.stamps.count ? ACCENT : SURFACE, fontSize: 16, fontWeight: 800 }}>{i < dash.stamps.count ? '★' : ''}</div>
                ))}
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                {dash.stamps.remaining === 0 ? `Reward ready: ${dash.stamps.reward_text}!` : `${dash.stamps.remaining} more to ${dash.stamps.reward_text}`}
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 4px' }}>Your balance</p>
              <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>{dash.points.balance.toLocaleString()}</div>
              <p style={{ fontSize: 14, color: INK_SOFT, margin: '6px 0 0' }}>points · worth ${dash.points.dollar_value.toFixed(2)} in-store</p>
            </div>
          )}

          {/* REWARD AVAILABLE — display only, redeem is in-store */}
          {reward.available && (
            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, border: BORDER, background: ACCENT, fontSize: 14, fontWeight: 700, textAlign: 'center' }}>
              {isStamps ? `🎁 ${reward.text} — claim it in store` : `🎁 You can redeem $${(reward.dollars ?? 0).toFixed(2)} in-store`}
            </div>
          )}
        </div>

        {/* TIER (points mode) */}
        {!isStamps && dash.tier && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: BORDER, color: dash.tier.current_color }}>{dash.tier.current_label}{dash.tier.multiplier > 1 ? ` · ${dash.tier.multiplier}×` : ''}</span>
              {dash.tier.next_label && <span style={{ fontSize: 12, color: INK_SOFT }}>${dash.tier.to_next_spend.toFixed(0)} spend to {dash.tier.next_label}</span>}
            </div>
            {dash.tier.next_label ? bar(dash.tier.progress_pct) : <p style={{ fontSize: 12, color: INK_SOFT, margin: 0 }}>You&apos;re at our top tier — thank you!</p>}
          </div>
        )}

        {/* ACTIVITY */}
        <div style={card}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>Recent activity</p>
          {dash.empty || dash.activity.length === 0 ? (
            <p style={{ fontSize: 14, color: INK_SOFT, margin: 0, lineHeight: 1.5 }}>Start earning — show your email at the counter on your next visit. 🌱</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {dash.activity.map((a, i) => {
                const isRedeem = a.type === 'redeem'
                const delta = isStamps ? a.stamps_delta : a.points_delta
                const unit = isStamps ? (Math.abs(delta) === 1 ? 'stamp' : 'stamps') : 'pts'
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid #eee' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{isRedeem ? (a.reward_redeemed ? `Redeemed: ${a.reward_redeemed}` : 'Redeemed') : a.type === 'earn' ? 'Earned' : a.type}</div>
                      <div style={{ fontSize: 12, color: INK_SOFT }}>{new Date(a.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: delta < 0 ? '#d11' : INK }}>{delta > 0 ? '+' : ''}{delta} {unit}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

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
