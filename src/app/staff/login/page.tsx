'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'forgot' | 'forgot-sent'

// ─── Design tokens — same palette as the rest of the portal ─────────────
const CARD   = '#ffffff'
const INK    = '#1d2a24'
const MUTED  = '#6b7d74'
const LINE   = '#e6ece8'
const DEEP   = '#2D5240'
const RED    = '#E24B4A'
const SHADOW = '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)'

// Light-mode input style (matches leave / availability pages)
const INP: React.CSSProperties = {
  background: CARD,
  border: '1px solid ' + LINE,
  borderRadius: 10,
  padding: '10px 14px',
  color: INK,
  fontSize: 14,
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
}

export default function StaffLoginPage() {
  const [mode,     setMode]     = useState<Mode>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const router = useRouter()

  // ── handleLogin — PRESERVED EXACTLY ─────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password || !supabase) return
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    setLoading(false)
    if (err) {
      const msg = err.message.toLowerCase()
      if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
        setError('Incorrect email or password.')
      } else if (msg.includes('email not confirmed')) {
        setError('Email not confirmed. Check your inbox for the invite link.')
      } else {
        setError(err.message)
      }
      return
    }
    router.replace('/staff/portal')
  }

  // ── handleForgot — PRESERVED EXACTLY ────────────────────────────────────
  const handleForgot = async () => {
    if (!email.trim() || !supabase) return
    setLoading(true); setError('')
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.ariaos.site'
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/staff/reset-password`,
    })
    setLoading(false)
    setMode('forgot-sent')
  }

  // ── goLogin — PRESERVED EXACTLY ──────────────────────────────────────────
  const goLogin = () => { setMode('login'); setError('') }

  const btnBase: React.CSSProperties = {
    width: '100%', padding: '11px', borderRadius: 12,
    fontSize: 14, fontWeight: 600,
    background: DEEP, color: '#ffffff',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#f4f7f5' }}>
      <div className="w-full max-w-sm" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Branding */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 34, fontWeight: 500, fontStyle: 'italic',
            color: DEEP, marginBottom: 4,
          }}>
            Aria
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>Staff Portal</div>
        </div>

        {/* ── Sign in ──────────────────────────────────────────────────── */}
        {mode === 'login' && (
          <div className="rounded-2xl p-6"
            style={{ background: CARD, border: '1px solid ' + LINE, boxShadow: SHADOW }}>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{
                fontFamily: 'var(--font-display, serif)',
                fontSize: 22, fontWeight: 600, color: INK, margin: 0,
              }}>
                Sign in
              </h1>
              <p style={{ fontSize: 13, color: MUTED, marginTop: 5 }}>
                Enter your work email and password.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
                  Email
                </label>
                {/* onChange PRESERVED EXACTLY */}
                <input type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com" autoFocus style={INP} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
                  Password
                </label>
                {/* onChange + onKeyDown PRESERVED EXACTLY */}
                <input type="password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="Your password" style={INP} />
              </div>

              {error && <p style={{ fontSize: 12, color: RED, margin: 0 }}>{error}</p>}

              {/* onClick + disabled PRESERVED EXACTLY */}
              <button onClick={handleLogin}
                disabled={loading || !email.trim() || !password}
                className="disabled:opacity-40"
                style={btnBase}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>

              {/* onClick PRESERVED EXACTLY */}
              <button onClick={() => { setMode('forgot'); setError('') }}
                style={{
                  width: '100%', fontSize: 12, textAlign: 'center',
                  color: MUTED, background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', paddingTop: 2,
                }}>
                Forgot password?
              </button>
            </div>

            <p style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 18, opacity: 0.75 }}>
              First time? You need an invite from your employer first.
            </p>
          </div>
        )}

        {/* ── Forgot password ───────────────────────────────────────────── */}
        {mode === 'forgot' && (
          <div className="rounded-2xl p-6"
            style={{ background: CARD, border: '1px solid ' + LINE, boxShadow: SHADOW }}>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{
                fontFamily: 'var(--font-display, serif)',
                fontSize: 22, fontWeight: 600, color: INK, margin: 0,
              }}>
                Reset your password
              </h1>
              <p style={{ fontSize: 13, color: MUTED, marginTop: 5 }}>
                Enter your work email and we'll send you a reset link.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
                  Work or personal email
                </label>
                {/* onChange + onKeyDown PRESERVED EXACTLY */}
                <input type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleForgot()}
                  placeholder="you@email.com" autoFocus style={INP} />
              </div>

              {error && <p style={{ fontSize: 12, color: RED, margin: 0 }}>{error}</p>}

              {/* onClick + disabled PRESERVED EXACTLY */}
              <button onClick={handleForgot}
                disabled={loading || !email.trim()}
                className="disabled:opacity-40"
                style={btnBase}>
                {loading ? 'Sending…' : 'Send reset link →'}
              </button>

              {/* onClick PRESERVED EXACTLY */}
              <button onClick={goLogin}
                style={{
                  width: '100%', fontSize: 12, textAlign: 'center',
                  color: MUTED, background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', paddingTop: 2,
                }}>
                ← Back to sign in
              </button>
            </div>
          </div>
        )}

        {/* ── Reset link sent ───────────────────────────────────────────── */}
        {mode === 'forgot-sent' && (
          <div className="rounded-2xl p-6"
            style={{
              background: CARD, border: '1px solid ' + LINE,
              boxShadow: SHADOW, textAlign: 'center',
            }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
            <div style={{
              fontFamily: 'var(--font-display, serif)',
              fontSize: 20, fontWeight: 600, color: INK, marginBottom: 10,
            }}>
              Check your email
            </div>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, marginBottom: 10 }}>
              If <strong style={{ color: INK }}>{email}</strong> is registered, a reset link is on its way.
              Click it to choose a new password.
            </p>
            <p style={{ fontSize: 11, color: MUTED, marginBottom: 16, opacity: 0.8 }}>
              The link expires in 1 hour. Check your spam folder if you don't see it.
            </p>
            {/* onClick PRESERVED EXACTLY */}
            <button onClick={goLogin}
              style={{
                fontSize: 12, color: DEEP, background: 'none',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
              ← Back to sign in
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
