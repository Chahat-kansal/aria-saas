'use client'
import { useState } from 'react'
import { INK, SUBTEXT, BORDER } from '@/app/owner/theme'

// OWNER-APP PH-1 — money decisions require step-up auth before approve. Re-enters the owner's
// real password, verified server-side via Supabase Auth's own signInWithPassword
// (api/owner/decisions/stepup) — a genuine re-auth, not a rubber stamp.
export function StepUpSheet({ onCancel, onVerified }: { onCancel: () => void; onVerified: (token: string) => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verify() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/owner/decisions/stepup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const json = await res.json()
      if (!res.ok) { setError('Wrong password — try again'); setBusy(false); return }
      onVerified(json.stepup_token)
    } catch {
      setError('Network error — try again')
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(10,10,10,0.55)' }} />
      <div style={{ position: 'relative', width: '100%', background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: BORDER, margin: '0 auto 16px' }} />
        <div style={{ fontWeight: 700, fontSize: 18, color: INK }}>Confirm it's you</div>
        <div style={{ fontSize: 13, color: SUBTEXT, marginTop: 4 }}>This decision moves money — re-enter your password to approve.</div>

        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{ width: '100%', marginTop: 16, padding: '14px 16px', borderRadius: 12, border: '1px solid ' + BORDER, fontSize: 15, boxSizing: 'border-box' }}
        />
        {error && <div style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            disabled={busy}
            onClick={onCancel}
            style={{ flex: 1, padding: '14px 0', borderRadius: 999, border: '1px solid ' + BORDER, background: '#fff', color: INK, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            disabled={busy || !password}
            onClick={verify}
            style={{ flex: 1, padding: '14px 0', borderRadius: 999, border: 'none', background: INK, color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: busy || !password ? 0.6 : 1 }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
