'use client'

import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

const GLASS_BG = 'rgba(255,255,255,0.65)'
const GLASS_BORDER = '1px solid rgba(0,0,0,0.05)'
const GLASS_SHADOW = '0 2px 12px rgba(0,0,0,0.05)'
const GLASS_BLUR = 'blur(12px)'

type MeData = {
  found: boolean
  customer_id?: string
  name?: string
  email?: string | null
  phone?: string | null
  member_since?: string | null
  points_balance?: number
  loyalty_tier?: string | null
  total_spent?: string
  visit_count?: number
  last_visit_at?: string | null
}

function formatPhone(p: string | null | undefined): string {
  if (!p) return '—'
  if (p.startsWith('+61')) {
    const digits = '0' + p.slice(3)
    return digits.slice(0, 4) + ' ' + digits.slice(4, 7) + ' ' + digits.slice(7)
  }
  return p
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' })
}

function SectionLabel({ title }: { title: string }) {
  return (
    <p style={{ fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', paddingLeft: 4 }}>
      {title}
    </p>
  )
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: GLASS_BG,
      backdropFilter: GLASS_BLUR,
      WebkitBackdropFilter: GLASS_BLUR,
      borderRadius: 18,
      border: GLASS_BORDER,
      boxShadow: GLASS_SHADOW,
      overflow: 'hidden',
      marginBottom: 20,
      ...style,
    }}>
      {children}
    </div>
  )
}

function RowItem({ label, value, href }: { label: string; value?: string; href?: string }) {
  const content = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
      <span style={{ fontFamily: FB, fontSize: 15, color: INK }}>{label}</span>
      {value && <span style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED }}>{value}</span>}
    </div>
  )
  if (href) return <a href={href} style={{ textDecoration: 'none', display: 'block' }}>{content}</a>
  return <div>{content}</div>
}

function Toggle({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
      <span style={{ fontFamily: FB, fontSize: 15, color: INK }}>{label}</span>
      <button
        onClick={onToggle}
        style={{
          width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
          background: value ? ACCENT : 'rgba(0,0,0,0.15)',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: value ? 21 : 3,
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s',
          display: 'block',
        }} />
      </button>
    </div>
  )
}

export function AccountClient({ slug, bizName, logoUrl }: {
  slug: string
  bizId: string
  bizName: string
  logoUrl: string | null
}) {
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sms, setSms] = useState(true)
  const [email, setEmail] = useState(true)
  const [currentPhone, setCurrentPhone] = useState('')

  // Edit profile state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [editErr, setEditErr] = useState('')

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
    setCurrentPhone(phone)

    fetch('/api/public/cx/' + slug + '/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
      .then(r => r.json())
      .then((data: MeData) => {
        setMe(data)
        setEditName(data.name ?? '')
        setEditEmail(data.email ?? '')
        setLoading(false)
      })
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

  const startEdit = () => {
    setEditName(me?.name ?? '')
    setEditEmail(me?.email ?? '')
    setEditErr('')
    setEditing(true)
  }

  const cancelEdit = () => { setEditing(false); setEditErr('') }

  const saveEdit = async () => {
    if (!me?.customer_id || saving) return
    setSaving(true)
    setEditErr('')
    try {
      const res = await fetch('/api/public/cx/' + slug + '/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: me.customer_id, phone: currentPhone, name: editName, email: editEmail }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setMe(prev => prev ? { ...prev, name: editName, email: editEmail || null } : prev)
        setEditing(false)
      } else {
        setEditErr(data.error ?? 'Update failed')
      }
    } catch {
      setEditErr('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const signOut = () => {
    try { localStorage.removeItem('aria_cx_' + slug) } catch { /* ok */ }
    window.location.replace('/' + slug + '/onboarding')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB, color: INK_MUTED }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, paddingBottom: 'calc(96px + env(safe-area-inset-bottom))', maxWidth: '28rem', margin: '0 auto' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* Header */}
      <div style={{ padding: '52px 20px 24px', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 14px',
          background: logoUrl ? ('url(' + logoUrl + ') center/cover no-repeat #f0ede8') : '#f0ede8',
          border: '2px solid rgba(0,0,0,0.08)',
        }} />
        <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 28, margin: '0 0 8px', color: INK }}>
          {me?.name ?? bizName}
        </h1>
        {me?.loyalty_tier && (
          <span style={{
            display: 'inline-block', background: ACCENT, color: ACCENT_TEXT,
            fontFamily: FB, fontSize: 11, fontWeight: 700, padding: '3px 14px',
            borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {me.loyalty_tier}
          </span>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Stats */}
        {me?.found && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Points', value: (me.points_balance ?? 0).toLocaleString() },
              { label: 'Visits', value: String(me.visit_count ?? 0) },
              { label: 'Spent', value: '$' + (me.total_spent ?? '0.00') },
            ].map(s => (
              <div key={s.label} style={{ background: GLASS_BG, backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR, borderRadius: 14, padding: '14px 12px', textAlign: 'center', border: GLASS_BORDER, boxShadow: GLASS_SHADOW }}>
                <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, margin: '0 0 2px', color: INK, fontWeight: 700 }}>{s.value}</p>
                <p style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Profile */}
        <SectionLabel title="Profile" />
        <GlassCard>
          {editing ? (
            <div style={{ padding: '16px 18px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Name</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Your name"
                  style={{ width: '100%', border: '1.5px solid rgba(0,0,0,0.14)', borderRadius: 10, padding: '11px 14px', fontFamily: FB, fontSize: 15, color: INK, background: '#fff', outline: 'none' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  placeholder="email@example.com"
                  style={{ width: '100%', border: '1.5px solid rgba(0,0,0,0.14)', borderRadius: 10, padding: '11px 14px', fontFamily: FB, fontSize: 15, color: INK, background: '#fff', outline: 'none' }}
                />
              </div>
              {editErr && (
                <p style={{ fontFamily: FB, fontSize: 13, color: '#dc2626', margin: '0 0 12px' }}>{editErr}</p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => void saveEdit()}
                  disabled={saving || editName.trim().length < 2}
                  style={{ flex: 1, background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 10, padding: '11px', fontFamily: FB, fontSize: 14, fontWeight: 700, cursor: saving || editName.trim().length < 2 ? 'not-allowed' : 'pointer', opacity: saving || editName.trim().length < 2 ? 0.6 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={cancelEdit}
                  style={{ flex: 1, background: 'rgba(0,0,0,0.06)', color: INK, border: 'none', borderRadius: 10, padding: '11px', fontFamily: FB, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <div>
                  <p style={{ fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Name</p>
                  <p style={{ fontFamily: FB, fontSize: 15, color: INK, margin: 0 }}>{me?.name ?? '—'}</p>
                </div>
                <button onClick={startEdit} style={{ background: ACCENT + '33', border: 'none', fontFamily: FB, fontSize: 13, color: ACCENT_TEXT, cursor: 'pointer', fontWeight: 700, padding: '6px 12px', borderRadius: 8 }}>
                  Edit
                </button>
              </div>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <p style={{ fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Email</p>
                <p style={{ fontFamily: FB, fontSize: 15, color: me?.email ? INK : INK_MUTED, margin: 0 }}>{me?.email ?? 'Not set'}</p>
              </div>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <p style={{ fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Mobile</p>
                <p style={{ fontFamily: FB, fontSize: 15, color: INK, margin: 0 }}>{formatPhone(me?.phone ?? currentPhone)}</p>
              </div>
              <div style={{ padding: '14px 18px' }}>
                <p style={{ fontFamily: FB, fontSize: 11, fontWeight: 700, color: INK_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Member since</p>
                <p style={{ fontFamily: FB, fontSize: 15, color: INK, margin: 0 }}>{formatDate(me?.member_since)}</p>
              </div>
            </>
          )}
        </GlassCard>

        {/* Activity */}
        <SectionLabel title="Activity" />
        <GlassCard>
          <RowItem label="Last visit" value={formatDate(me?.last_visit_at)} />
          <div style={{ borderBottom: 'none' }}>
            <RowItem label="Order history" href={'/' + slug + '/history'} />
          </div>
        </GlassCard>

        {/* Notifications */}
        <SectionLabel title="Notifications" />
        <GlassCard>
          <Toggle label="SMS updates" value={sms} onToggle={() => savePrefs('sms', !sms)} />
          <div style={{ borderBottom: 'none' }}>
            <Toggle label="Email updates" value={email} onToggle={() => savePrefs('email', !email)} />
          </div>
        </GlassCard>

        {/* Privacy */}
        <SectionLabel title="Privacy" />
        <GlassCard>
          <div style={{ borderBottom: 'none' }}>
            <RowItem label="Privacy policy" href={'/' + slug + '#privacy'} />
          </div>
        </GlassCard>

        {/* Sign out */}
        <button
          onClick={signOut}
          style={{
            width: '100%', background: 'none', border: '1.5px solid rgba(0,0,0,0.12)',
            borderRadius: 14, padding: '14px', fontFamily: FB, fontSize: 15, color: INK,
            cursor: 'pointer', fontWeight: 600, marginBottom: 8,
          }}
        >
          Sign out
        </button>
      </div>

      <CxTabBar slug={slug} active="account" />
    </div>
  )
}