'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'set-password' | 'success' | 'error'

const INP: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(127,184,151,0.2)',
  borderRadius: 12,
  padding: '10px 14px',
  color: '#E8EDE7',
  fontSize: 14,
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
}

export default function AcceptInvitePage() {
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [validationError, setValidationError] = useState('')
  const router = useRouter()

  // Read the link type synchronously during first render, before Supabase's
  // detectSessionInUrl (which runs as a Promise/microtask) clears the hash.
  // type=recovery means this is a password-reset link, not an invite.
  const [initialLinkType] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.hash.slice(1)).get('type')
  })

  useEffect(() => {
    const init = async () => {
      if (!supabase) { setStatus('error'); setMessage('Authentication unavailable.'); return }

      // Recovery links arrive here when Supabase's redirectTo fallback is accept-invite.
      // Detect and re-route so the user sees the password-reset form, not an invite prompt.
      if (initialLinkType === 'recovery') {
        router.replace('/staff/reset-password')
        return
      }

      // Establish session from URL hash (Supabase invite/magic-link token exchange)
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

      // Call accept-invite API to mark portal_enabled=true.
      // The response includes was_already_enabled so we know whether to show the password form.
      const res = await fetch('/api/staff/portal/accept-invite', { method: 'POST' })
      const json: { ok?: boolean; was_already_enabled?: boolean; warning?: string } =
        res.ok || res.status === 404 ? await res.json().catch(() => ({})) : {}

      if (json.was_already_enabled) {
        // Rescue / re-login path: staff already has a password — just redirect
        setStatus('success')
        setMessage('Welcome back! Redirecting to your portal…')
        setTimeout(() => router.push('/staff/portal'), 1000)
        return
      }

      // New invite path: prompt staff to create a password
      setStatus('set-password')
    }
    init()
  }, [router, initialLinkType])

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
      style={{ background: 'var(--bg-page, #0E1411)', color: 'var(--text-primary, #E8EDE7)' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-2xl font-medium italic" style={{ color: 'var(--accent, #7FB897)' }}>Aria</div>
          <div className="text-sm" style={{ color: '#A8B5A8' }}>Staff Portal</div>
        </div>

        {status === 'loading' && (
          <div className="text-center py-8">
            <div className="w-5 h-5 rounded-full border-2 animate-spin mx-auto"
              style={{ borderColor: '#7FB897', borderTopColor: 'transparent' }} />
            <p className="text-sm mt-3" style={{ color: '#A8B5A8' }}>Setting up your account…</p>
          </div>
        )}

        {status === 'set-password' && (
          <div className="rounded-2xl p-6 space-y-4"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div>
              <h1 className="font-medium text-lg">Create your password</h1>
              <p className="text-sm mt-1" style={{ color: '#A8B5A8' }}>
                Choose a password to log in to the staff portal going forward.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: '#A8B5A8' }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters" autoFocus style={INP} />
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: '#A8B5A8' }}>Confirm password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                  placeholder="Repeat your password" style={INP} />
              </div>
              {validationError && <p className="text-xs" style={{ color: '#EF4444' }}>{validationError}</p>}
              <button onClick={handleSetPassword} disabled={submitting || !password || !confirm}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                {submitting ? 'Setting up…' : 'Create account →'}
              </button>
            </div>
          </div>
        )}

        {(status === 'success' || status === 'error') && (
          <div className="rounded-2xl p-6 text-center space-y-4"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div className="text-4xl">{status === 'success' ? '✓' : '✕'}</div>
            <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{message}</p>
            {status === 'error' && (
              <a href="/staff/login" className="text-sm hover:underline" style={{ color: 'var(--accent, #7FB897)' }}>
                Go to login →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
