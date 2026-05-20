'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function LoyaltyEnrolPage() {
  const params = useParams()
  const bid = params?.business_id as string
  const [biz, setBiz] = useState<{ name: string } | null>(null)
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', birthday: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    fetch(`/api/public/loyalty/${bid}`)
      .then(r => r.json())
      .then(d => { setBiz(d.business); setConfig(d.config); setLoading(false) })
      .catch(() => setLoading(false))
  }, [bid])

  const submit = async () => {
    if (!form.name || !form.phone) { setError('Name and phone are required'); return }
    setSubmitting(true); setError('')
    const r = await fetch(`/api/public/loyalty/${bid}/enrol`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, business_id: bid }),
    })
    const d = await r.json()
    if (d.error) setError(d.error)
    else setDone(true)
    setSubmitting(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0F1A15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#7FB897' }}>Loading…</p>
    </div>
  )

  if (!biz || !config) return (
    <div style={{ minHeight: '100vh', background: '#0F1A15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#A8B5A8' }}>Loyalty programme not available.</p>
    </div>
  )

  if (done) return (
    <div style={{ minHeight: '100vh', background: '#0F1A15', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F0F4F0', marginBottom: 8 }}>You&apos;re in!</h1>
        <p style={{ color: '#A8B5A8', fontSize: 15 }}>Welcome to {biz.name}&apos;s loyalty programme. Show this to staff when you visit to earn points.</p>
      </div>
    </div>
  )

  const INP: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 10,
    border: '1px solid rgba(127,184,151,0.2)', background: '#1A2620',
    color: '#F0F4F0', fontSize: 15, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F1A15', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#2D5240', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>⭐</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#F0F4F0', marginBottom: 6 }}>Join {biz.name}</h1>
          <p style={{ color: '#A8B5A8', fontSize: 14 }}>
            {config.program_type === 'stamps'
              ? `Collect stamps — get ${String(config.stamp_reward_text ?? 'a free reward')} after ${String(config.stamps_to_reward ?? 10)} visits`
              : `Earn ${String(config.points_per_dollar ?? 1)} point per $1 spent`}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Full name *', key: 'name', type: 'text', placeholder: 'Jane Smith' },
            { label: 'Mobile number *', key: 'phone', type: 'tel', placeholder: '0400 000 000' },
            { label: 'Email (optional)', key: 'email', type: 'email', placeholder: 'jane@email.com' },
            { label: 'Birthday (optional)', key: 'birthday', type: 'date', placeholder: '' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: 12, color: '#A8B5A8', display: 'block', marginBottom: 6 }}>{label}</label>
              <input
                type={type}
                value={(form as Record<string, string>)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                style={INP}
              />
            </div>
          ))}

          {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

          <button
            onClick={submit}
            disabled={submitting}
            style={{ background: '#2D5240', color: '#7FB897', border: 'none', borderRadius: 10, padding: '14px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 4 }}
          >
            {submitting ? 'Joining…' : 'Join loyalty programme →'}
          </button>

          <p style={{ fontSize: 11, color: '#A8B5A8', textAlign: 'center' }}>
            By joining you agree to receive SMS updates from {biz.name}. Reply STOP to opt out anytime.
          </p>
        </div>
      </div>
    </div>
  )
}
