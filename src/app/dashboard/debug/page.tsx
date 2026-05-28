'use client'
import * as Sentry from '@sentry/nextjs'
import { useState } from 'react'

export default function SentryDebugPage() {
  const [sent, setSent] = useState(false)

  function throwTestError() {
    const err = new Error('[Sentry test] Verify error capture is reaching Sentry — safe to ignore')
    Sentry.captureException(err)
    setSent(true)
  }

  return (
    <div style={{ padding: 32, fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Sentry verification</h1>
      <button
        onClick={throwTestError}
        style={{ padding: '8px 16px', background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        Send test error to Sentry
      </button>
      {sent && (
        <p style={{ marginTop: 16, color: '#48bb78' }}>
          Test error captured — check the Sentry dashboard for &quot;[Sentry test] Verify error capture&quot;.
        </p>
      )}
    </div>
  )
}
