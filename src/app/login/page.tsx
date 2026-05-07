'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LogoMark from '@/components/pos/LogoMark'

const iS: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const lS: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    const redirectTo = searchParams.get('redirectTo') || '/dashboard'
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <form onSubmit={handleLogin}>
      <div style={{ marginBottom: 16 }}>
        <label style={lS}>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          style={iS}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={lS}>Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          style={iS}
        />
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: '10px 14px',
          color: '#EF4444', fontSize: 13,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', height: 48,
          background: loading ? 'rgba(139,92,246,0.5)' : '#8B5CF6',
          color: 'white', border: 'none', borderRadius: 12,
          fontSize: 15, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: loading ? 'none' : '0 4px 0 rgba(124,58,237,0.5), 0 6px 20px rgba(139,92,246,0.3)',
          transition: 'all 150ms',
        }}
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

export default function OwnerLoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Manrope', system-ui, sans-serif",
    }}>
      {/* Background orbs */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '-50px', left: '-80px', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      <div style={{
        position: 'relative', zIndex: 1,
        background: 'rgba(26,23,40,0.85)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(139,92,246,0.2)',
        borderRadius: 24,
        padding: 40,
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 0 60px rgba(139,92,246,0.12)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <LogoMark size={32} />
          </div>
          <h1 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 28,
            color: '#8B5CF6',
            fontWeight: 400,
            margin: 0,
          }}>
            Aria
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>
            Sign in to your dashboard
          </p>
        </div>

        <Suspense fallback={<div style={{ height: 200 }} />}>
          <LoginForm />
        </Suspense>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/forgot-password" style={{ color: 'rgba(139,92,246,0.7)', fontSize: 13, textDecoration: 'none' }}>
            Forgot password?
          </a>
        </div>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <a href="/signup" style={{ color: 'rgba(139,92,246,0.7)', fontSize: 13, textDecoration: 'none' }}>
            Don&apos;t have an account? Sign up
          </a>
        </div>

        {/* Staff separator */}
        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          textAlign: 'center',
        }}>
          <a href="/pos" style={{ color: 'var(--text-tertiary)', fontSize: 12, textDecoration: 'none' }}>
            Staff? → Go to POS →
          </a>
        </div>
      </div>
    </div>
  )
}
