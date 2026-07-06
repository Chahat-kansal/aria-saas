'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const CARD_BG = '#fff'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type MeData = {
  found: boolean
  customer_id?: string
  name?: string
  points_balance?: number
  loyalty_tier?: string | null
  total_spent?: string
  visit_count?: number
  last_visit_at?: string | null
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px', paddingLeft: 4 }}>
        {title}
      </p>
      <div style={{ background: CARD_BG, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, href, onPress, danger }: {
  label: string
  value?: string
  href?: string
  onPress?: () => void
  danger?: boolean
}) {
  const content = (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)',
    }}>
      <span style={{ fontFamily: FB, fontSize: 15, color: danger ? '#dc2626' : INK }}>{label}</span>
      {value && <span style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED }}>{value}</span>}
    </div>
  )
  if (href) return <a href={href} style={{ textDecoration: 'none', display: 'block' }}>{content}</a>
  if (onPress) return <button onClick={onPress} style={{ background: 'none', border: 'none', width: '100%', padding: 0, cursor: 'pointer', textAlign: 'left' }}>{content}</button>
  return <div>{content}</div>
}

export function AccountClient({ slug, bizId, bizName, logoUrl }: {
  slug: string
  bizId: string
  bizName: string
  logoUrl: string | null
}) {
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sms, setSms] = useState(true)
  const [email, setEmail] = useState(true)

  useEffect(() => {
    let phone = ''
    try {
      const saved = localStorage.getItem('aria_cx_' + slug)
      if (saved) phone = (JSON.parse(saved) as { phone?: string }).phone ?? ''
    } catch { /* ok */ }

    if (!phone) {
      window.location.replace('/' + slug + '/onboarding')
      return
    }

    fetch('/api/public/cx/' + slug + '/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
      .then(r => r.json())
      .then((data: MeData) => { setMe(data); setLoading(false) })
      .catch(() => setLoading(false))

    try {
      const prefs = localStorage.getItem('aria_cx_prefs_' + slug)
      if (prefs) {
        const p = JSON.parse(prefs) as { sms?: boolean; email?: boolean }
        if (p.sms !== undefined) setSms(p.sms)
        if (p.email !== undefined) setEmail(p.email)
      }
    } catch { /* ok */ }
  }, [slug])

  const savePrefs = (key: 'sms' | 'email', val: boolean) => {
    const next = { sms, email, [key]: val }
    try { localStorage.setItem('aria_cx_prefs_' + slug, JSON.stringify(next)) } catch { /* ok */ }
    if (key === 'sms') setSms(val)
    else setEmail(val)
  }

  const signOut = () => {
    try { localStorage.removeItem('aria_cx_' + slug) } catch { /* ok */ }
    window.location.replace('/' + slug + '/onboarding')
  }

  const formatDate = (s: string | null | undefined) => {
    if (!s) return '—'
    return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB, color: INK_MUTED }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 28px', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 14px',
          background: logoUrl ? ('url(' + logoUrl + ') center/cover no-repeat #f0ede8') : '#f0ede8',
          border: '2px solid rgba(0,0,0,0.08)',
        }} />
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 28, margin: '0 0 4px', color: INK }}>
          {me?.name ?? bizName}
        </h1>
        {me?.loyalty_tier && (
          <span style={{
            display: 'inline-block', background: ACCENT, color: ACCENT_TEXT,
            fontFamily: FB, fontSize: 11, fontWeight: 700, padding: '3px 12px',
            borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {me.loyalty_tier}
          </span>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Stats */}
        {me?.found && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
            {[
              { label: 'Points', value: (me.points_balance ?? 0).toLocaleString() },
              { label: 'Visits', value: String(me.visit_count ?? 0) },
              { label: 'Spent', value: '$' + (me.total_spent ?? '0.00') },
            ].map(s => (
              <div key={s.label} style={{ background: CARD_BG, borderRadius: 14, padding: '14px 12px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, margin: '0 0 2px', color: INK, fontWeight: 700 }}>{s.value}</p>
                <p style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Activity */}
        <Section title="Activity">
          <Row label="Last visit" value={formatDate(me?.last_visit_at)} />
          <Row label="Order history" href={'/' + slug + '/history'} />
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <span style={{ fontFamily: FB, fontSize: 15, color: INK }}>SMS updates</span>
            <button
              onClick={() => savePrefs('sms', !sms)}
              style={{
                width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: sms ? ACCENT : 'rgba(0,0,0,0.15)',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: sms ? 21 : 3,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s',
              }} />
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
            <span style={{ fontFamily: FB, fontSize: 15, color: INK }}>Email updates</span>
            <button
              onClick={() => savePrefs('email', !email)}
              style={{
                width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: email ? ACCENT : 'rgba(0,0,0,0.15)',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: email ? 21 : 3,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s',
              }} />
            </button>
          </div>
        </Section>

        {/* Privacy */}
        <Section title="Privacy">
          <Row label="Privacy policy" href={'/' + slug + '#privacy'} />
          <Row
            label="Delete my data"
            onPress={() => {
              if (typeof window !== 'undefined' && window.confirm('This will delete all your loyalty data. Continue?')) {
                signOut()
              }
            }}
            danger
          />
        </Section>

        {/* Sign out */}
        <button
          onClick={signOut}
          style={{
            width: '100%', background: 'none', border: '1.5px solid rgba(0,0,0,0.12)',
            borderRadius: 14, padding: '14px', fontFamily: FB, fontSize: 15, color: INK,
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          Sign out
        </button>
      </div>

      <CxTabBar slug={slug} active="account" />
    </div>
  )
}