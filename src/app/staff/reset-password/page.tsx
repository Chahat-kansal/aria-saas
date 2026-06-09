'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'form' | 'success' | 'error'

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

export default function StaffResetPasswordPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [validationError, setValidationError] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (!supabase) { setStatus('error'); setMessage('Authentication unavailable.'); return }

    let resolved = false

    // PRIMARY: listen for PASSWORD_RECOVERY event — Supabase fires this when a recovery
    // link is processed, even if detectSessionInUrl already ran before we subscribed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY' && !resolved) {
        resolved = true
        setStatus('form')
      }
    })

    // FALLBACK: Supabase may have already processed the recovery session via
    // detectSessionInUrl before we subscribed above. Check getSession() as backup.
    const init = async () => {
      const { data: { session } } = await supabase!.auth.getSession()

      if (session && !resolved) {
        // A session exists — it may be a recovery session already processed by the SDK.
        // Show the form; updateUser({ password }) will succeed for recovery sessions.
        resolved = true
        setStatus('form')
        return
      }

      if (!session) {
        // Manual hash exchange (Supabase detectSessionInUrl disabled or hash not processed)
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
            // onAuthStateChange will fire PASSWORD_RECOVERY and set status='form'
          } else {
            setStatus('error')
            setMessage('Reset link is missing credentials. Please request a new one.')
          }
        } else if (!resolved) {
          // No hash and no session — invalid state
          setStatus('error')
          setMessage('No reset session found. Please use the link from your email.')
        }
      }
    }
    init()

    return () => subscription.unsubscribe()
  }, [])

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
    // Sign out the recovery session so the user logs in fresh with the new password
    await supabase.auth.signOut({ scope: 'local' })
    setTimeout(() => router.replace('/staff/login'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0E1411', color: '#E8EDE7' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-3xl font-medium italic" style={{ color: '#7FB897' }}>Aria</div>
          <div className="text-sm" style={{ color: '#A8B5A8' }}>Staff Portal</div>
        </div>

        {status === 'loading' && (
          <div className="text-center py-8">
            <div className="w-5 h-5 rounded-full border-2 animate-spin mx-auto"
              style={{ borderColor: '#7FB897', borderTopColor: 'transparent' }} />
            <p className="text-sm mt-3" style={{ color: '#A8B5A8' }}>Verifying reset link…</p>
          </div>
        )}

        {(status === 'success' || status === 'error') && (
          <div className="rounded-2xl p-6 text-center space-y-3"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div className="text-4xl">{status === 'success' ? '✓' : '✕'}</div>
            <p className="text-sm" style={{ color: '#A8B5A8' }}>{message}</p>
            {status === 'error' && (
              <a href="/staff/login" className="text-sm hover:underline" style={{ color: '#7FB897' }}>
                Back to login →
              </a>
            )}
          </div>
        )}

        {status === 'form' && (
          <div className="rounded-2xl p-6 space-y-4"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div>
              <h1 className="font-medium text-lg">Set a new password</h1>
              <p className="text-sm mt-1" style={{ color: '#A8B5A8' }}>
                Choose a password you'll use to log in to the staff portal.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: '#A8B5A8' }}>New password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters" autoFocus style={INP} />
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: '#A8B5A8' }}>Confirm password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="Repeat your password" style={INP} />
              </div>
              {validationError && <p className="text-xs" style={{ color: '#EF4444' }}>{validationError}</p>}
              <button onClick={submit} disabled={submitting || !password || !confirm}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                {submitting ? 'Updating…' : 'Set password →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
