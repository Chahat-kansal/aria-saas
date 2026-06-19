'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// Locked Pipel design — light ink-on-cream, hard 1.5px borders, Cormorant + Outfit.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = "var(--font-body, 'Outfit', system-ui, sans-serif)"

function SetPinInner() {
  const params = useSearchParams()
  const token = params?.get('token') ?? ''
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ name: string | null } | null>(null)

  const submit = async () => {
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('Your PIN must be exactly 6 digits.'); return }
    if (pin !== confirm) { setError('The two PINs don’t match.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/loyalty/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept-invite', token, pin }),
      })
      const d = await r.json()
      if (!r.ok || d.error) setError(d.error || 'Something went wrong. Try again.')
      else setDone({ name: d.name ?? null })
    } catch { setError('Something went wrong. Try again.') }
    setBusy(false)
  }

  const card: React.CSSProperties = { background: SURFACE, border: BORDER, borderRadius: 22, padding: 28, boxShadow: '4px 4px 0 #0a0a0a' }
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: BORDER, background: SURFACE, color: INK, fontSize: 22, letterSpacing: 8, textAlign: 'center', outline: 'none', boxSizing: 'border-box', fontFamily: FONT }

  if (!token) return (
    <div style={card}><p style={{ color: INK_SOFT, textAlign: 'center', margin: 0 }}>This link is missing its invite token. Please use the link from your message.</p></div>
  )

  if (done) return (
    <div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 10 }}>🎉</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>You&apos;re all set{done.name ? `, ${done.name.split(' ')[0]}` : ''}!</h1>
      <p style={{ color: INK_SOFT, fontSize: 15, lineHeight: 1.5, margin: 0 }}>Your PIN is set. You&apos;re signed in on this device — show your email at the counter to earn and redeem points.</p>
    </div>
  )

  return (
    <div style={card}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px', fontFamily: "var(--font-display, 'Cormorant', Georgia, serif)", fontStyle: 'italic' }}>Choose your PIN</h1>
      <p style={{ color: INK_SOFT, fontSize: 14, margin: '0 0 18px' }}>Pick a 6-digit PIN you&apos;ll remember — you&apos;ll use it to sign in to your rewards.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={inp} aria-label="New PIN" />
        <input inputMode="numeric" maxLength={6} value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="Confirm PIN" style={inp} aria-label="Confirm PIN" />
        {error && <p style={{ color: '#d11', fontSize: 13, margin: 0 }}>{error}</p>}
        <button onClick={submit} disabled={busy} style={{ height: 48, borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: busy ? 0.6 : 1 }}>{busy ? 'Setting…' : 'Set my PIN →'}</button>
      </div>
    </div>
  )
}

export default function SetPinPage() {
  return (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <Suspense fallback={<p style={{ textAlign: 'center', color: INK_SOFT }}>Loading…</p>}>
          <SetPinInner />
        </Suspense>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: INK_SOFT }}>Powered by Aria</div>
      </div>
    </div>
  )
}
