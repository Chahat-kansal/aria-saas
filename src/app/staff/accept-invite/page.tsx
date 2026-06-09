'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'set-password' | 'success' | 'error'

// ─── Design tokens — same palette as the rest of the portal ─────────────
const CARD   = '#ffffff'
const INK    = '#1d2a24'
const MUTED  = '#6b7d74'
const LINE   = '#e6ece8'
const SAGE   = '#7FB897'
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

export default function AcceptInvitePage() {
  const [status,          setStatus]          = useState<Status>('loading')
  const [message,         setMessage]         = useState('')
  const [password,        setPassword]        = useState('')
  const [confirm,         setConfirm]         = useState('')
  const [submitting,      setSubmitting]      = useState(false)
  const [validationError, setValidationError] = useState('')
  const router = useRouter()

  // ── PRESERVED EXACTLY — read link type synchronously before hash clears ──
  const [initialLinkType] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.hash.slice(1)).get('type')
  })

  // ── useEffect init — PRESERVED EXACTLY ───────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (!supabase) { setStatus('error'); setMessage('Authentication unavailable.'); return }

      if (initialLinkType === 'recovery') {
        router.replace('/staff/reset-password')
        return
      }

      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session) {
        const hash = window.location.hash
        if (hash.includes('access_token')) {
          const params = new URLSearchParams(hash.slice(1))
          const accessToken = params.get('access_token')
          const refreshToken = params.get('refresh_token')
          if (accessToken && refreshToken) {
            const { error: setErr } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            if (setErr) { setStatus('error'); setMessage('Failed to set up session. Please try the link again.'); return }
          }
        } else {
          setStatus('error')
          setMessage('Session not found. Please use the link from your invitation email.')
          return
        }
      }

      const res = await fetch('/api/staff/portal/accept-invite', { method: 'POST' })
      const json: { ok?: boolean; was_already_enabled?: boolean; warning?: string } =
        res.ok || res.status === 404 ? await res.json().catch(() => ({})) : {}

      if (json.was_already_enabled) {
        setStatus('success')
        setMessage('Welcome back! Redirecting to your portal…')
        setTimeout(() => router.push('/staff/portal'), 1000)
        return
      }

      setStatus('set-password')
    }
    init()
  }, [router, initialLinkType])

  // ── handleSetPassword — PRESERVED EXACTLY ────────────────────────────────
  const handleSetPassword = async () => {
    setValidationError('')
    if (password.length < 8) { setValidationError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setValidationError('Passwords do not match.'); return }
    if (!supabase) return

    setSubmitting(true)
    const { error: pwErr } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (pwErr) { setValidationError(pwErr.message); return }

    setStatus('success')
    setMessage('Account set up! Redirecting to your portal…')
    setTimeout(() => router.push('/staff/portal'), 1500)
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

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div className="w-5 h-5 rounded-full border-2 animate-spin mx-auto"
              style={{ borderColor: SAGE, borderTopColor: 'transparent' }} />
            <p style={{ fontSize: 13, color: MUTED, marginTop: 12 }}>Setting up your account…</p>
          </div>
        )}

        {/* ── Create password ───────────────────────────────────────────── */}
        {status === 'set-password' && (
          <div className="rounded-2xl p-6"
            style={{ background: CARD, border: '1px solid ' + LINE, boxShadow: SHADOW }}>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{
                fontFamily: 'var(--font-display, serif)',
                fontSize: 22, fontWeight: 600, color: INK, margin: 0,
              }}>
                Create your password
              </h1>
              <p style={{ fontSize: 13, color: MUTED, marginTop: 5 }}>
                Choose a password to log in to the staff portal going forward.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
                  Password
                </label>
                {/* onChange PRESERVED EXACTLY */}
                <input type="password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters" autoFocus style={INP} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
                  Confirm password
                </label>
                {/* onChange + onKeyDown PRESERVED EXACTLY */}
                <input type="password" value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                  placeholder="Repeat your password" style={INP} />
              </div>

              {validationError && (
                <p style={{ fontSize: 12, color: RED, margin: 0 }}>{validationError}</p>
              )}

              {/* onClick + disabled PRESERVED EXACTLY */}
              <button onClick={handleSetPassword}
                disabled={submitting || !password || !confirm}
                className="disabled:opacity-40"
                style={{
                  width: '100%', padding: '11px', borderRadius: 12,
                  fontSize: 14, fontWeight: 600,
                  background: DEEP, color: '#ffffff',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {submitting ? 'Setting up…' : 'Create account →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Success / Error ───────────────────────────────────────────── */}
        {(status === 'success' || status === 'error') && (
          <div className="rounded-2xl p-6"
            style={{
              background: CARD, border: '1px solid ' + LINE,
              boxShadow: SHADOW, textAlign: 'center',
            }}>
            <div style={{
              fontSize: 40, marginBottom: 12,
              color: status === 'success' ? SAGE : RED,
            }}>
              {status === 'success' ? '✓' : '✕'}
            </div>
            <p style={{ fontSize: 13, color: MUTED }}>{message}</p>
            {status === 'error' && (
              <a href="/staff/login"
                style={{ fontSize: 13, color: DEEP, display: 'block', marginTop: 14 }}>
                Go to login →
              </a>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
