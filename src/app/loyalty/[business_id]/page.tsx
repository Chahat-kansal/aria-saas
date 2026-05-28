'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

// Locked Pipel design (prompt 83) — light, ink-on-cream, hard 1.5px borders, Inter.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = 'Inter, system-ui, -apple-system, sans-serif'

interface Config { program_type?: string; points_per_dollar?: number; stamps_to_reward?: number; stamp_reward_text?: string; public_enrol_enabled?: boolean; tier_silver_points?: number; tier_gold_points?: number; tier_platinum_points?: number }

export default function LoyaltyEnrolPage() {
  const params = useParams()
  const bid = params?.business_id as string
  const [biz, setBiz] = useState<{ name: string } | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', birthday: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'join' | 'check'>('join')
  const [checkPhone, setCheckPhone] = useState('')
  const [checking, setChecking] = useState(false)
  const [balance, setBalance] = useState<{ name: string; points: number; visits: number } | null>(null)
  const [checkMsg, setCheckMsg] = useState('')

  useEffect(() => {
    if (!bid) return
    fetch(`/api/public/loyalty/${bid}`).then(r => r.json())
      .then(d => { setBiz(d.business); setConfig(d.config); setLoading(false) })
      .catch(() => setLoading(false))
  }, [bid])

  const submit = async () => {
    if (!form.name || !form.phone) { setError('Name and phone are required'); return }
    setSubmitting(true); setError('')
    const r = await fetch(`/api/public/loyalty/${bid}/enrol`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, business_id: bid }),
    })
    const d = await r.json()
    if (d.error) setError(d.error); else setDone(true)
    setSubmitting(false)
  }

  const check = async () => {
    if (!checkPhone.trim()) return
    setChecking(true); setCheckMsg(''); setBalance(null)
    try {
      const d = await fetch(`/api/public/loyalty/${bid}/balance?phone=${encodeURIComponent(checkPhone.trim())}`).then(r => r.json())
      if (d.found) setBalance({ name: d.name, points: d.points, visits: d.visits })
      else setCheckMsg("We couldn't find a member with that number. Join below!")
    } catch { setCheckMsg('Something went wrong — try again.') }
    setChecking(false)
  }

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>{children}</div>
    </div>
  )

  if (loading) return wrap(<p style={{ textAlign: 'center', color: INK_SOFT }}>Loading…</p>)
  if (!biz || !config) return wrap(<p style={{ textAlign: 'center', color: INK_SOFT }}>Loyalty programme not available.</p>)

  if (done) return wrap(
    <div style={{ background: SURFACE, border: BORDER, borderRadius: 22, padding: 28, textAlign: 'center', boxShadow: '4px 4px 0 #0a0a0a' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>You&apos;re in!</h1>
      <p style={{ color: INK_SOFT, fontSize: 15, lineHeight: 1.5 }}>Welcome to {biz.name}&apos;s loyalty programme. Show this at the counter when you visit to earn points.</p>
    </div>
  )

  const isStamps = config.program_type === 'stamps'
  const enrolOpen = config.public_enrol_enabled !== false
  const tiers = [
    { label: 'Silver', pts: config.tier_silver_points },
    { label: 'Gold', pts: config.tier_gold_points },
    { label: 'Platinum', pts: config.tier_platinum_points },
  ].filter(t => typeof t.pts === 'number' && (t.pts as number) > 0)

  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: BORDER, background: SURFACE, color: INK, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: FONT }

  return wrap(
    <div>
      {/* Hero */}
      <div style={{ background: SURFACE, border: BORDER, borderRadius: 22, padding: 24, textAlign: 'center', boxShadow: '4px 4px 0 #0a0a0a', marginBottom: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, border: BORDER, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 26 }}>★</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>{biz.name} Rewards</h1>
        <p style={{ color: INK_SOFT, fontSize: 14, margin: 0 }}>
          {isStamps ? `Collect stamps — ${config.stamp_reward_text ?? 'a free reward'} after ${config.stamps_to_reward ?? 10} visits` : `Earn ${config.points_per_dollar ?? 1} point per $1 spent`}
        </p>
        {tiers.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
            {tiers.map(t => (
              <div key={t.label} style={{ flex: 1, border: BORDER, borderRadius: 12, padding: '8px 4px', background: CREAM }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: INK_SOFT }}>{t.pts}+ pts</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {enrolOpen && <button onClick={() => setMode('join')} style={{ flex: 1, height: 40, borderRadius: 12, border: BORDER, background: mode === 'join' ? ACCENT : SURFACE, color: INK, fontWeight: mode === 'join' ? 700 : 500, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}>Join</button>}
        <button onClick={() => setMode('check')} style={{ flex: 1, height: 40, borderRadius: 12, border: BORDER, background: mode === 'check' ? ACCENT : SURFACE, color: INK, fontWeight: mode === 'check' ? 700 : 500, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}>Check my points</button>
      </div>

      <div style={{ background: SURFACE, border: BORDER, borderRadius: 18, padding: 20 }}>
        {mode === 'check' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="tel" value={checkPhone} onChange={e => setCheckPhone(e.target.value)} placeholder="Your mobile number" style={inp} />
            <button onClick={check} disabled={checking || !checkPhone.trim()} style={{ height: 46, borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: checking ? 0.6 : 1 }}>{checking ? 'Checking…' : 'Check points'}</button>
            {balance && (
              <div style={{ textAlign: 'center', border: BORDER, borderRadius: 14, padding: 16, background: CREAM }}>
                <div style={{ fontSize: 13, color: INK_SOFT }}>Hi {balance.name}, you have</div>
                <div style={{ fontSize: 34, fontWeight: 800 }}>{balance.points} pts</div>
                <div style={{ fontSize: 12, color: INK_SOFT }}>{balance.visits} visits</div>
              </div>
            )}
            {checkMsg && <p style={{ fontSize: 13, color: INK_SOFT, textAlign: 'center' }}>{checkMsg}</p>}
          </div>
        ) : !enrolOpen ? (
          <p style={{ fontSize: 14, color: INK_SOFT, textAlign: 'center', lineHeight: 1.5 }}>Sign-ups happen in store — just ask our team to add you next time you visit.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Full name *', key: 'name', type: 'text', placeholder: 'Jane Smith' },
              { label: 'Mobile number *', key: 'phone', type: 'tel', placeholder: '0400 000 000' },
              { label: 'Email (optional)', key: 'email', type: 'email', placeholder: 'jane@email.com' },
              { label: 'Birthday (optional)', key: 'birthday', type: 'date', placeholder: '' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label style={{ fontSize: 12, color: INK_SOFT, display: 'block', marginBottom: 5 }}>{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} style={inp} />
              </div>
            ))}
            {error && <p style={{ color: '#d11', fontSize: 13 }}>{error}</p>}
            <button onClick={submit} disabled={submitting} style={{ height: 48, borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Joining…' : 'Join loyalty programme →'}</button>
            <p style={{ fontSize: 11, color: INK_SOFT, textAlign: 'center', lineHeight: 1.4 }}>By joining you agree to receive SMS updates from {biz.name}. Reply STOP to opt out anytime.</p>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: INK_SOFT }}>Powered by Aria</div>
    </div>
  )
}
