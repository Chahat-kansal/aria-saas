'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PALETTE, BORDER, RADIUS, MAX_W, FONT_DISPLAY } from './theme'

// CX-ENTRY-1 — first-touch choice gate. A returning member (session cookie OR linked account) passes
// straight through to the feed; a brand-new visitor chooses anonymous vs account before entering.
// Both paths give FULL access — only data persistence differs (anonymous = device-only; account = synced).
export function CommunityGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'member' | 'choose'>('checking')
  const [card, setCard] = useState<'none' | 'anon' | 'account'>('none')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/community/session')
      .then(r => r.json())
      .then(d => { if (active) setStatus(d?.member ? 'member' : 'choose') })
      // Fail-open: never trap a real member behind the gate on a transient check error.
      .catch(() => { if (active) setStatus('member') })
    return () => { active = false }
  }, [])

  async function startAnonymous() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/community/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() || undefined }),
      })
      if (!res.ok) throw new Error('Could not start')
      setStatus('member')
    } catch { setError('Could not start — please try again.') }
    setBusy(false)
  }

  async function createAccount() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password })
      if (e) { setError(e.message); setBusy(false); return }
      if (!data.user) { setError('Could not create account — please try again.'); setBusy(false); return }
      // Ensure a community member exists for this session, then link the account to it.
      await fetch('/api/community/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {})
      const link = await fetch('/api/community/account-link', { method: 'POST' }).then(r => r.json()).catch(() => null)
      if (!link?.ok) { setError('Account made — finishing setup failed. Try signing in.'); setBusy(false); return }
      setStatus('member')
    } catch { setError('Could not create account.') }
    setBusy(false)
  }

  async function signIn() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const { data, error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (e) { setError(e.message); setBusy(false); return }
      if (!data.user) { setError('Could not sign in.'); setBusy(false); return }
      // resolveOrLinkMember finds this account's member and sets the session cookie.
      const link = await fetch('/api/community/account-link', { method: 'POST' }).then(r => r.json()).catch(() => null)
      if (!link?.ok) { setError('Signed in, but no community profile found — try Create account.'); setBusy(false); return }
      setStatus('member')
    } catch { setError('Could not sign in.') }
    setBusy(false)
  }

  if (status === 'checking') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: PALETTE.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
        <span style={{ width: 44, height: 44, borderRadius: 14, background: PALETTE.accent, border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: PALETTE.ink, letterSpacing: '-0.04em', animation: 'community-pop 320ms ease-out' }}>a.</span>
      </div>
    )
  }

  if (status === 'member') return <>{children}</>

  // ── Choice screen ────────────────────────────────────────────────────────
  const input: React.CSSProperties = { width: '100%', padding: '12px 14px', background: PALETTE.surfaceAlt, border: BORDER, borderRadius: RADIUS.md, color: PALETTE.ink, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 }
  return (
    <div style={{ minHeight: '100dvh', background: PALETTE.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 18px' }}>
      <main style={{ width: '100%', maxWidth: MAX_W }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: PALETTE.accent, border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: PALETTE.ink, letterSpacing: '-0.04em' }}>a.</span>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: PALETTE.ink }}>aria</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15, margin: '0 0 8px', fontFamily: FONT_DISPLAY, color: PALETTE.ink }}>Welcome to Aria Community</h1>
        <p style={{ fontSize: 15, color: PALETTE.inkSoft, margin: '0 0 22px', lineHeight: 1.5 }}>Local shops, one feed. How do you want to start?</p>

        {/* CARD 1 — anonymous */}
        <section style={{ background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.xl, padding: 18, marginBottom: 14 }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: PALETTE.ink }}>Continue anonymously</p>
          <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '6px 0 0', lineHeight: 1.5 }}>Pick a nickname. Follow shops, save offers, message businesses. Your follows stay on this device only.</p>
          {card === 'anon' ? (
            <div style={{ marginTop: 14 }}>
              <input value={nickname} onChange={e => { setNickname(e.target.value); setError('') }} placeholder="Nickname (optional)" maxLength={40} style={input} />
              <button onClick={startAnonymous} disabled={busy}
                style={{ width: '100%', padding: '13px', border: 'none', borderRadius: RADIUS.md, background: PALETTE.ink, color: PALETTE.surface, fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', minHeight: 46, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Starting…' : 'Start browsing'}
              </button>
            </div>
          ) : (
            <button onClick={() => { setCard('anon'); setError('') }}
              style={{ marginTop: 14, width: '100%', padding: '12px', border: BORDER, borderRadius: RADIUS.md, background: 'transparent', color: PALETTE.ink, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
              Continue anonymously
            </button>
          )}
        </section>

        {/* CARD 2 — account (recommended) */}
        <section style={{ background: PALETTE.surface, border: `1.5px solid ${PALETTE.ink}`, borderRadius: RADIUS.xl, padding: 18, position: 'relative' }}>
          <span style={{ position: 'absolute', top: 14, right: 14, background: PALETTE.accent, color: PALETTE.ink, border: BORDER, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: RADIUS.pill }}>recommended</span>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: PALETTE.ink }}>Create an account</p>
          <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '6px 0 0', lineHeight: 1.5 }}>Email + password. Everything anonymous keeps, plus your follows &amp; saves sync across devices and come back every time you log in.</p>
          {card === 'account' ? (
            <div style={{ marginTop: 14 }}>
              <input value={email} onChange={e => { setEmail(e.target.value); setError('') }} placeholder="Email address" type="email" autoComplete="email" style={input} />
              <input value={password} onChange={e => { setPassword(e.target.value); setError('') }} placeholder="Password (min 8 chars)" type="password" autoComplete="current-password" style={input} />
              <button onClick={createAccount} disabled={busy || !email.trim() || !password}
                style={{ width: '100%', padding: '13px', border: 'none', borderRadius: RADIUS.md, background: PALETTE.accent, color: PALETTE.ink, fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', minHeight: 46, opacity: busy || !email.trim() || !password ? 0.6 : 1 }}>
                {busy ? 'Working…' : 'Create account'}
              </button>
              <button onClick={signIn} disabled={busy || !email.trim() || !password}
                style={{ width: '100%', marginTop: 8, padding: '10px', background: 'transparent', border: 'none', color: PALETTE.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Already have an account? <span style={{ color: PALETTE.ink, fontWeight: 700, textDecoration: 'underline' }}>Sign in</span>
              </button>
            </div>
          ) : (
            <button onClick={() => { setCard('account'); setError('') }}
              style={{ marginTop: 14, width: '100%', padding: '13px', border: 'none', borderRadius: RADIUS.md, background: PALETTE.accent, color: PALETTE.ink, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', minHeight: 46 }}>
              Create an account
            </button>
          )}
        </section>

        {error && <p style={{ fontSize: 13, color: PALETTE.live, margin: '14px 0 0', textAlign: 'center', fontWeight: 600 }}>{error}</p>}

        <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: '20px 0 0', textAlign: 'center', lineHeight: 1.6 }}>
          Either way, businesses never see your real identity. Anonymous data lives on this device; create an account to keep it forever.
        </p>
      </main>
    </div>
  )
}
