'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../../theme'

interface Business { id: string; name: string; industry: string | null; city: string | null; suburb: string | null; logo_url: string | null; website: string | null }
interface ExistingFollow { id: string; consent_marketing: boolean; notifications_on: boolean; is_hidden: boolean }

export default function BusinessFollowPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const businessId = params.id

  const [biz, setBiz] = useState<Business | null>(null)
  const [existing, setExisting] = useState<ExistingFollow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Consent toggles — explicit, default safe (off for marketing, on for notifications)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [notificationsOn, setNotificationsOn] = useState(true)
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!businessId) return
    (async () => {
      const [bRes, fRes] = await Promise.all([
        fetch('/api/community/businesses/' + businessId).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/community/follows').then(r => r.ok ? r.json() : { follows: [] }),
      ])
      if (!bRes || !bRes.business) { setNotFound(true); setLoading(false); return }
      setBiz(bRes.business)
      const f = (fRes.follows ?? []).find((x: { business_id: string }) => x.business_id === businessId)
      if (f) {
        setExisting({ id: f.id, consent_marketing: f.consent_marketing, notifications_on: f.notifications_on, is_hidden: f.is_hidden })
        setConsentMarketing(f.consent_marketing)
        setNotificationsOn(f.notifications_on)
      }
      setLoading(false)
    })()
  }, [businessId])

  async function follow() {
    setBusy(true)
    await fetch('/api/community/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        consent_marketing: consentMarketing,
        notifications_on: notificationsOn,
        nickname: nickname || undefined,
      }),
    })
    setBusy(false)
    setDone(true)
  }

  async function unfollow() {
    if (!confirm('Unfollow ' + (biz?.name ?? 'this business') + '?')) return
    setBusy(true)
    await fetch('/api/community/follows?business_id=' + businessId, { method: 'DELETE' })
    setExisting(null)
    setDone(false)
    setBusy(false)
  }

  if (loading) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ height: 80, background: C.surfaceHi, borderRadius: RADIUS.lg, marginBottom: 16 }} />
        <div style={{ height: 20, width: '60%', background: C.surfaceHi, borderRadius: RADIUS.sm }} />
      </main>
    )
  }

  if (notFound) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontFamily: FONT_DISPLAY, fontStyle: 'italic' }}>Business not found</h1>
        <p style={{ color: C.textMuted, marginTop: 8 }}>This shop may have left the network.</p>
        <Link href="/community" style={{ display: 'inline-block', marginTop: 20, color: C.accent }}>← Back to Community</Link>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '24px 20px 64px' }}>
      <Link href="/community" style={{ display: 'inline-block', fontSize: 13, color: C.textMuted, marginBottom: 20, textDecoration: 'none' }}>← Community</Link>

      {/* Business header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{
          width: 64, height: 64, borderRadius: RADIUS.pill,
          background: biz?.logo_url ? `url(${biz.logo_url}) center/cover` : C.accentDeep,
          color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 24, flexShrink: 0, border: '1px solid ' + C.border,
        }}>
          {!biz?.logo_url && (biz?.name?.[0] ?? '?')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: FONT_DISPLAY, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {biz?.name}
          </h1>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '4px 0 0' }}>
            {biz?.industry ?? 'shop'}{(biz?.suburb || biz?.city) ? ' · ' + (biz?.suburb ?? biz?.city) : ''}
          </p>
        </div>
      </header>

      {done && existing && (
        <div style={{ padding: '14px 16px', background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.25)', borderRadius: RADIUS.md, color: C.accent, fontSize: 14, marginBottom: 20 }}>
          ✓ You&apos;re following {biz?.name}. Manage in <Link href="/community" style={{ color: C.accent, textDecoration: 'underline' }}>Community</Link>.
        </div>
      )}

      {/* Consent panel */}
      <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 20, marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>What you&apos;re consenting to</p>
        <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 16px', lineHeight: 1.55 }}>
          Per-business consent — following {biz?.name} does NOT let other businesses contact you.
        </p>

        <ConsentRow
          label="See their posts in my feed"
          subtitle="Always on for businesses you follow"
          value={true}
          locked
        />
        <ConsentRow
          label="Push notifications when they post"
          subtitle="Browser notifications — you can turn this off any time"
          value={notificationsOn}
          onChange={setNotificationsOn}
        />
        <ConsentRow
          label="Marketing offers and promos"
          subtitle="Opt in to receive promotional content from this business"
          value={consentMarketing}
          onChange={setConsentMarketing}
        />

        {!existing && (
          <div style={{ marginTop: 18 }}>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 6 }}>Nickname (optional)</span>
              <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Skip to stay anonymous" maxLength={40}
                style={{ width: '100%', padding: '12px 14px', background: C.surfaceHi, border: '1px solid ' + C.border, borderRadius: RADIUS.md, color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </label>
          </div>
        )}
      </section>

      {/* Action */}
      {existing && !done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={follow} disabled={busy}
            style={{ width: '100%', padding: '14px', background: C.accentDeep, color: C.accent, border: '1px solid ' + C.accent + '55', borderRadius: RADIUS.md, fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', minHeight: 48, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Updating…' : 'Update preferences'}
          </button>
          <button onClick={unfollow} disabled={busy}
            style={{ width: '100%', padding: '12px', background: 'transparent', color: C.danger, border: '1px solid rgba(239,68,68,0.3)', borderRadius: RADIUS.md, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
            Unfollow
          </button>
        </div>
      ) : !done ? (
        <button onClick={follow} disabled={busy}
          style={{ width: '100%', padding: '14px', background: C.accent, color: '#0d0d14', border: 'none', borderRadius: RADIUS.md, fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', minHeight: 48, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Following…' : `Follow ${biz?.name}`}
        </button>
      ) : (
        <button onClick={() => router.push('/community')}
          style={{ width: '100%', padding: '14px', background: C.accent, color: '#0d0d14', border: 'none', borderRadius: RADIUS.md, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48 }}>
          Done — back to Community
        </button>
      )}

      <p style={{ fontSize: 11, color: C.textMuted, marginTop: 14, lineHeight: 1.55, textAlign: 'center' }}>
        You can change these settings or unfollow anytime. Australian Privacy Act + Spam Act compliant.
      </p>
    </main>
  )
}

function ConsentRow({ label, subtitle, value, onChange, locked = false }: {
  label: string
  subtitle: string
  value: boolean
  onChange?: (v: boolean) => void
  locked?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid ' + C.border, minHeight: 56 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: C.text }}>{label}</p>
        <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0', lineHeight: 1.4 }}>{subtitle}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={locked}
        onClick={() => onChange?.(!value)}
        style={{
          position: 'relative', width: 42, height: 24, borderRadius: 24,
          background: value ? C.accent : 'rgba(255,255,255,0.12)',
          border: 'none', cursor: locked ? 'default' : 'pointer', transition: 'background 180ms',
          flexShrink: 0, opacity: locked ? 0.65 : 1,
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left 180ms',
        }} />
      </button>
    </div>
  )
}
