'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function StaffLoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSend = async () => {
    if (!email.trim() || !supabase) return
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/staff/accept-invite` },
    })
    if (err) {
      setError(err.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0E1411', color: '#E8EDE7' }}>
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="text-3xl font-medium italic" style={{ color: '#7FB897' }}>Aria</div>
          <div className="text-sm" style={{ color: '#A8B5A8' }}>Staff Portal</div>
        </div>

        {sent ? (
          <div className="rounded-2xl p-6 text-center space-y-3"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div className="text-3xl">📧</div>
            <div className="font-medium">Check your email</div>
            <p className="text-sm" style={{ color: '#A8B5A8' }}>
              We sent a login link to <strong style={{ color: '#E8EDE7' }}>{email}</strong>.
              Click it to access your staff portal.
            </p>
            <p className="text-xs" style={{ color: '#6E7C6E' }}>
              The link expires in 1 hour. Check your spam folder if you don't see it.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="text-xs hover:underline mt-2"
              style={{ color: '#7FB897' }}>
              Use a different email
            </button>
          </div>
        ) : (
          <div className="rounded-2xl p-6 space-y-4"
            style={{ background: '#1A2620', border: '1px solid rgba(127,184,151,0.15)' }}>
            <div>
              <h1 className="font-medium text-lg">Sign in to your portal</h1>
              <p className="text-sm mt-1" style={{ color: '#A8B5A8' }}>
                Enter your work email — we'll send you a one-click login link. No password needed.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: '#A8B5A8' }}>
                  Work or personal email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="you@email.com"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(127,184,151,0.2)',
                    color: '#E8EDE7',
                  }}
                />
              </div>

              {error && (
                <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>
              )}

              <button
                onClick={handleSend}
                disabled={loading || !email.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#2D5240', color: '#7FB897' }}>
                {loading ? 'Sending…' : 'Send login link →'}
              </button>
            </div>

            <p className="text-xs text-center" style={{ color: '#6E7C6E' }}>
              First time? You need an invite from your employer first.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
