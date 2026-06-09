'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'forgot' | 'forgot-sent'

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

export default function StaffLoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

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

  const goLogin = () => { setMode('login'); setError('') }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0E1411', color: '#E8EDE7' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="text-3xl font-medium italic" style={{ color: '#7FB897' }}>Aria</div>
          <div className="text-sm" style={{ color: '#A8B5A8' }}>Staff Portal</div>
        </div>

        {mode === 'login' && (
          <div className="rounded-2xl p-6 space-y-4"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div>
              <h1 className="font-medium text-lg">Sign in</h1>
              <p className="text-sm mt-1" style={{ color: '#A8B5A8' }}>Enter your work email and password.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: '#A8B5A8' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com" autoFocus style={INP} />
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: '#A8B5A8' }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="Your password" style={INP} />
              </div>
              {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
              <button onClick={handleLogin} disabled={loading || !email.trim() || !password}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
              <button onClick={() => { setMode('forgot'); setError('') }}
                className="w-full text-xs text-center hover:underline pt-1"
                style={{ color: '#A8B5A8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Forgot password?
              </button>
            </div>
            <p className="text-xs text-center" style={{ color: '#6E7C6E' }}>
              First time? You need an invite from your employer first.
            </p>
          </div>
        )}

        {mode === 'forgot' && (
          <div className="rounded-2xl p-6 space-y-4"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div>
              <h1 className="font-medium text-lg">Reset your password</h1>
              <p className="text-sm mt-1" style={{ color: '#A8B5A8' }}>
                Enter your work email and we'll send you a reset link.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: '#A8B5A8' }}>Work or personal email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleForgot()}
                  placeholder="you@email.com" autoFocus style={INP} />
              </div>
              {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
              <button onClick={handleForgot} disabled={loading || !email.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                {loading ? 'Sending…' : 'Send reset link →'}
              </button>
              <button onClick={goLogin}
                className="w-full text-xs text-center hover:underline pt-1"
                style={{ color: '#A8B5A8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                ← Back to sign in
              </button>
            </div>
          </div>
        )}

        {mode === 'forgot-sent' && (
          <div className="rounded-2xl p-6 text-center space-y-3"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div className="text-3xl">📧</div>
            <div className="font-medium">Check your email</div>
            <p className="text-sm" style={{ color: '#A8B5A8' }}>
              If <strong style={{ color: '#E8EDE7' }}>{email}</strong> is registered, a reset link is on its way.
              Click it to choose a new password.
            </p>
            <p className="text-xs" style={{ color: '#6E7C6E' }}>
              The link expires in 1 hour. Check your spam folder if you don't see it.
            </p>
            <button onClick={goLogin}
              className="text-xs hover:underline mt-2"
              style={{ color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
