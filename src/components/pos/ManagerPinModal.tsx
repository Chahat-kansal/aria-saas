'use client'
import { useState } from 'react'

interface Props {
  onSuccess: (token: string, staffName: string) => void
  onClose: () => void
  title?: string
}

export function ManagerPinModal({ onSuccess, onClose, title = 'Manager PIN Required' }: Props) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const push = (d: string) => {
    if (digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    setError('')
    if (next.length === 4) submit(next)
  }
  const pop = () => setDigits(d => d.slice(0, -1))

  const submit = async (pin: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/pos/manager-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (data.ok) {
        onSuccess(data.token, data.staff_name ?? 'Manager')
      } else {
        setError(data.error ?? 'Invalid PIN')
        setDigits('')
      }
    } catch {
      setError('Connection error')
      setDigits('')
    }
    setLoading(false)
  }

  const btn: React.CSSProperties = {
    width: 64, height: 64, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 22, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit',
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#111a14', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 20,
          padding: 32, width: '100%', maxWidth: 300, textAlign: 'center',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>

        <div style={{ fontSize: 13, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 12 }}>🔒 {title}</div>

        {/* PIN dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: '50%',
              background: i < digits.length ? '#7FB897' : 'rgba(255,255,255,0.15)',
              transition: 'background 0.15s',
            }} />
          ))}
        </div>

        {error && (
          <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        {/* Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, justifyItems: 'center' }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <button key={i} disabled={loading || !k}
              onClick={() => k === '⌫' ? pop() : k ? push(k) : undefined}
              style={{ ...btn, visibility: k ? 'visible' : 'hidden',
                background: k === '⌫' ? 'rgba(239,68,68,0.12)' : btn.background,
                opacity: loading ? 0.5 : 1 }}>
              {k}
            </button>
          ))}
        </div>

        <button onClick={onClose}
          style={{ marginTop: 18, width: '100%', padding: '10px 0', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}