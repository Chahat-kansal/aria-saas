'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function SentryDebugPage() {
  const [clientSent, setClientSent] = useState(false)
  const [serverResult, setServerResult] = useState<string | null>(null)
  const [serverLoading, setServerLoading] = useState(false)

  function throwTestError() {
    const err = new Error('[Sentry test] Verify error capture is reaching Sentry — safe to ignore')
    Sentry.captureException(err)
    setClientSent(true)
  }

  async function testServer() {
    setServerLoading(true)
    const secret = prompt('Enter SENTRY_DEBUG_SECRET value (set in Vercel env vars):')
    if (!secret) { setServerLoading(false); return }
    try {
      const res = await fetch('/api/debug/sentry-test', {
        headers: { 'x-debug-secret': secret },
      })
      const data = await res.json()
      setServerResult(res.ok
        ? 'Server error sent to Sentry ✓ — check dashboard for "PRR-3 Sentry test — server"'
        : 'Error: ' + (data.error ?? 'unknown'))
    } catch (e) {
      setServerResult('Network error: ' + (e as Error).message)
    }
    setServerLoading(false)
  }

  return (
    <div style={{ padding: 32, maxWidth: 560, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Sentry Verification</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 28, lineHeight: 1.6 }}>
        Use this page to verify Sentry is capturing both server and client errors in production.
        Errors only reach Sentry when <code>NODE_ENV=production</code> (i.e. on Vercel).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Client-side error</h2>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
            Calls <code>Sentry.captureException</code> directly from the browser.
          </p>
          <button
            onClick={throwTestError}
            style={{
              padding: '10px 18px', background: '#e53e3e', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, minHeight: 44,
            }}
          >
            Send test error to Sentry
          </button>
          {clientSent && (
            <p style={{ marginTop: 10, fontSize: 12, color: '#16a34a' }}>
              Test error captured — check the Sentry dashboard for &quot;[Sentry test] Verify error capture&quot;.
            </p>
          )}
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Server-side error</h2>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
            Calls <code>/api/debug/sentry-test</code> with <code>SENTRY_DEBUG_SECRET</code>.
            Set that env var in Vercel first.
          </p>
          <button
            onClick={testServer}
            disabled={serverLoading}
            style={{
              padding: '10px 18px', background: '#2D5240', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, minHeight: 44,
              opacity: serverLoading ? 0.6 : 1,
            }}
          >
            {serverLoading ? 'Sending…' : 'Send server error to Sentry'}
          </button>
          {serverResult && (
            <p style={{ marginTop: 10, fontSize: 12, color: serverResult.startsWith('Server error') ? '#16a34a' : '#dc2626' }}>
              {serverResult}
            </p>
          )}
        </section>
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: '#999' }}>
        This page is only accessible to authenticated users. It does not expose sensitive data.
      </p>
    </div>
  )
}
