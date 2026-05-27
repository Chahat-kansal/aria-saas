'use client'
import { useState, useEffect } from 'react'

const G = '#2D5240', Glight = '#7FB897'

interface Props {
  quoteId: string
  status: string
  isExpired: boolean
  acceptedAt: string | null
  acceptedByName: string | null
  businessName: string
  total: number
}

export default function AcceptSection({ quoteId, status, isExpired, acceptedAt, acceptedByName, businessName, total }: Props) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(status === 'accepted')
  const [acceptedBy, setAcceptedBy] = useState(acceptedByName)
  const [acceptedTime, setAcceptedTime] = useState(acceptedAt)

  useEffect(() => {
    fetch(`/api/quotes/${quoteId}/view`, { method: 'POST' }).catch(() => {})
  }, [quoteId])

  if (accepted) {
    return (
      <div style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.3)', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
        <p style={{ fontSize: 17, fontWeight: 700, color: G, margin: '0 0 6px' }}>Quote Accepted</p>
        <p style={{ fontSize: 14, color: '#6b7c72', margin: 0 }}>
          Accepted by <strong>{acceptedBy}</strong>
          {acceptedTime ? ` on ${new Date(acceptedTime).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
        </p>
      </div>
    )
  }

  if (isExpired || status === 'declined') {
    return (
      <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b', margin: '0 0 4px' }}>
          This quote has {status === 'declined' ? 'been declined' : 'expired'}.
        </p>
        <p style={{ fontSize: 13, color: '#6b7c72', margin: 0 }}>Please contact {businessName} for an updated quote.</p>
      </div>
    )
  }

  async function accept() {
    if (!name.trim()) { setError('Please enter your full name to accept this quote.'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/quotes/${quoteId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    const d = await res.json()
    if (d.ok) {
      setAccepted(true)
      setAcceptedBy(name.trim())
      setAcceptedTime(new Date().toISOString())
    } else {
      setError(d.error || 'Could not accept quote. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '28px', textAlign: 'center', border: `2px solid ${G}` }}>
      <p style={{ fontSize: 17, fontWeight: 700, color: G, margin: '0 0 4px' }}>Ready to Accept?</p>
      <p style={{ fontSize: 14, color: '#6b7c72', margin: '0 0 24px' }}>
        Total: <strong style={{ color: G, fontSize: 18 }}>A${total.toFixed(2)}</strong> inc. GST
      </p>
      <label style={{ fontSize: 12, color: '#6b7c72', display: 'block', textAlign: 'left', marginBottom: 6 }}>
        Your full name (digital acceptance record)
      </label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && accept()}
        placeholder="e.g. Jane Smith"
        style={{ width: '100%', padding: '12px 14px', border: '1px solid #d4e8db', borderRadius: 8, fontSize: 14, color: '#1a2e22', boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit' }}
      />
      {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10, textAlign: 'left' }}>{error}</p>}
      <button
        onClick={accept}
        disabled={loading}
        style={{ width: '100%', padding: '14px', background: loading ? 'rgba(45,82,64,0.5)' : G, color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
      >
        {loading ? 'Processing…' : `✅ Accept Quote — A$${total.toFixed(2)}`}
      </button>
      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 12, lineHeight: 1.5 }}>
        By clicking Accept, you confirm your agreement to the above quote and terms. This constitutes a digital acceptance record, which is legally sufficient for most Australian small business transactions.
      </p>
    </div>
  )
}
