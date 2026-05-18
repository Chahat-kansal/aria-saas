'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AcceptInvitePage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Setting up your account…')
  const router = useRouter()

  useEffect(() => {
    const handle = async () => {
      if (!supabase) { setStatus('error'); setMessage('Authentication unavailable.'); return }

      // Supabase puts the session tokens in the URL hash after invite acceptance
      // The SSR client handles the hash exchange automatically on page load
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session) {
        // Try to exchange the hash token if session not yet set
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

      if (res.ok || res.status === 404) {
        setStatus('success')
        setMessage('Account set up! Redirecting to your portal…')
        setTimeout(() => router.push('/staff/portal'), 1500)
      } else {
        setStatus('success')
        setMessage('Welcome! Redirecting to your portal…')
        setTimeout(() => router.push('/staff/portal'), 1500)
      }
    }
    handle()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-page, #0E1411)', color: 'var(--text-primary, #E8EDE7)' }}>
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-2xl font-medium italic" style={{ color: 'var(--accent, #7FB897)' }}>Aria</div>
        <div className={`text-4xl ${status === 'loading' ? 'animate-spin inline-block' : ''}`}>
          {status === 'loading' ? '⟳' : status === 'success' ? '✓' : '✕'}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{message}</p>
        {status === 'error' && (
          <a href="/login" className="text-sm hover:underline" style={{ color: 'var(--accent, #7FB897)' }}>
            Go to login →
          </a>
        )}
      </div>
    </div>
  )
}
