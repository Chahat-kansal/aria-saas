'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'form' | 'success' | 'error'

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

export default function StaffResetPasswordPage() {
  const [status,          setStatus]          = useState<Status>('loading')
  const [message,         setMessage]         = useState('')
  const [password,        setPassword]        = useState('')
  const [confirm,         setConfirm]         = useState('')
  const [submitting,      setSubmitting]      = useState(false)
  const [validationError, setValidationError] = useState('')
  const router = useRouter()

  // ── useEffect — PRESERVED EXACTLY (PASSWORD_RECOVERY listener + fallback) ─
  useEffect(() => {
    if (!supabase) { setStatus('error'); setMessage('Authentication unavailable.'); return }

    let resolved = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY' && !resolved) {
        resolved = true
        setStatus('form')
      }
    })

    const init = async () => {
      const { data: { session } } = await supabase!.auth.getSession()

      if (session && !resolved) {
        resolved = true
        setStatus('form')
        return
      }

      if (!session) {
        const hash = window.location.hash
        if (hash.includes('access_token')) {
          const p = new URLSearchParams(hash.slice(1))
          const accessToken = p.get('access_token')
          const refreshToken = p.get('refresh_token')
          if (accessToken && refreshToken) {
            const { error } = await supabase!.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            if (error) {
              setStatus('error')
              setMessage('Reset link is invalid or has expired. Please request a new one from the login page.')
            }
          } else {
            setStatus('error')
            setMessage('Reset link is missing credentials. Please request a new one.')
          }
        } else if (!resolved) {
          setStatus('error')
          setMessage('No reset session found. Please use the link from your email.')
        }
      }
    }
    init()

    return () => subscription.unsubscribe()
  }, [])

  // ── submit — PRESERVED EXACTLY (updateUser + signOut + redirect) ──────────
  const submit = async () => {
    setValidationError('')
    if (password.length < 8) { setValidationError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setValidationError('Passwords do not match.'); return }
    if (!supabase) return

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) { setValidationError(error.message); return }

    setStatus('success')
    setMessage('Password updated! Redirecting to sign in…')
    await supabase.auth.signOut({ scope: 'local' })
    setTimeout(() => router.replace('/staff/login'), 1500)
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
            <p style={{ fontSize: 13, color: MUTED, marginTop: 12 }}>Verifying reset link…</p>
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
                Back to login →
              </a>
            )}
          </div>
        )}

        {/* ── New password form ─────────────────────────────────────────── */}
        {status === 'form' && (
          <div className="rounded-2xl p-6"
            style={{ background: CARD, border: '1px solid ' + LINE, boxShadow: SHADOW }}>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{
                fontFamily: 'var(--font-display, serif)',
                fontSize: 22, fontWeight: 600, color: INK, margin: 0,
              }}>
                Set a new password
              </h1>
              <p style={{ fontSize: 13, color: MUTED, marginTop: 5 }}>
                Choose a password you'll use to log in to the staff portal.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 5 }}>
                  New password
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
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="Repeat your password" style={INP} />
              </div>

              {validationError && (
                <p style={{ fontSize: 12, color: RED, margin: 0 }}>{validationError}</p>
              )}

              {/* onClick + disabled PRESERVED EXACTLY */}
              <button onClick={submit}
                disabled={submitting || !password || !confirm}
                className="disabled:opacity-40"
                style={{
                  width: '100%', padding: '11px', borderRadius: 12,
                  fontSize: 14, fontWeight: 600,
                  background: DEEP, color: '#ffffff',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {submitting ? 'Updating…' : 'Set password →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
