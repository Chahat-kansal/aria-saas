'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from './theme'

interface Member { id: string; nickname: string | null; joined_at: string }
interface Follow {
  id: string
  business_id: string
  consent_marketing: boolean
  notifications_on: boolean
  is_hidden: boolean
  businesses: { name: string; industry: string | null; city: string | null; logo_url: string | null } | null
}

export default function CommunityHomePage() {
  const [member, setMember] = useState<Member | null>(null)
  const [follows, setFollows] = useState<Follow[]>([])
  const [loading, setLoading] = useState(true)
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingNick, setEditingNick] = useState(false)

  useEffect(() => {
    (async () => {
      const d = await fetch('/api/community/follows').then(r => r.json())
      setMember(d.member ?? null)
      setFollows(d.follows ?? [])
      setLoading(false)
    })()
  }, [])

  async function join() {
    setSaving(true)
    const res = await fetch('/api/community/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    }).then(r => r.json())
    setMember(res.member ?? null)
    setSaving(false)
  }

  async function saveNickname() {
    setSaving(true)
    await fetch('/api/community/session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    })
    if (member) setMember({ ...member, nickname: nickname || null })
    setEditingNick(false)
    setSaving(false)
  }

  async function leave() {
    if (!confirm('Leave Aria Community? This unfollows every business and removes your session — your follows can\'t be restored.')) return
    setSaving(true)
    await fetch('/api/community/session', { method: 'DELETE' })
    setMember(null); setFollows([]); setNickname(''); setEditingNick(false)
    setSaving(false)
  }

  async function togglePref(business_id: string, key: 'notifications_on' | 'is_hidden' | 'consent_marketing', value: boolean) {
    await fetch('/api/community/follows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id, [key]: value }),
    })
    setFollows(prev => prev.map(f => f.business_id === business_id ? { ...f, [key]: value } : f))
  }

  async function unfollow(business_id: string) {
    if (!confirm('Unfollow this business? You can re-follow anytime.')) return
    await fetch('/api/community/follows?business_id=' + business_id, { method: 'DELETE' })
    setFollows(prev => prev.filter(f => f.business_id !== business_id))
  }

  if (loading) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ height: 24, width: 160, background: C.surfaceHi, borderRadius: RADIUS.sm, marginBottom: 16 }} />
        <div style={{ height: 14, width: '80%', background: C.surfaceHi, borderRadius: RADIUS.sm }} />
      </main>
    )
  }

  // ─── NOT JOINED YET — anonymous landing ─────────────────────────
  if (!member) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '40px 20px 64px' }}>
        <header style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Aria Community</p>
          <h1 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.12, margin: '8px 0 10px', fontFamily: FONT_DISPLAY, fontStyle: 'italic' }}>
            Your local shops, one feed.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: C.textDim, margin: 0 }}>
            Browse anonymously — no signup needed. Join only if you want to follow a business or save what you find.
          </p>
        </header>

        <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 22, marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>Anonymous by design</p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13, color: C.textDim, lineHeight: 1.7 }}>
            <li>· No email, phone, or real name required — ever.</li>
            <li>· Following a shop is per-business and opt-in.</li>
            <li>· Leave any shop — or the whole network — anytime.</li>
            <li>· Identity (loyalty, points) lives only in-store, not here.</li>
          </ul>
        </section>

        <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 22 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>Pick a nickname (optional)</p>
          <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 14px', lineHeight: 1.5 }}>
            Used only when you comment on a post. Leave it blank to stay completely anonymous.
          </p>
          <input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="e.g. neighbour42"
            maxLength={40}
            style={{
              width: '100%', padding: '12px 14px',
              background: C.surfaceHi, border: '1px solid ' + C.border, borderRadius: RADIUS.md,
              color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
              marginBottom: 14,
            }}
          />
          <button
            onClick={join}
            disabled={saving}
            style={{
              width: '100%', padding: '14px', border: 'none', borderRadius: RADIUS.md,
              background: C.accent, color: '#0d0d14', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
              minHeight: 48,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Joining…' : 'Join the network'}
          </button>
          <p style={{ fontSize: 11, color: C.textMuted, margin: '12px 0 0', lineHeight: 1.55, textAlign: 'center' }}>
            By joining you accept the <Link href="/terms" style={{ color: C.textDim, textDecoration: 'underline' }}>Terms</Link> and{' '}
            <Link href="/privacy" style={{ color: C.textDim, textDecoration: 'underline' }}>Privacy</Link> notice. You can leave anytime.
          </p>
        </section>
      </main>
    )
  }

  // ─── JOINED ─────────────────────────────────────────────────────
  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '32px 20px 64px' }}>
      <header style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Aria Community</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 0', fontFamily: FONT_DISPLAY, fontStyle: 'italic' }}>
          {member.nickname ? `Hi ${member.nickname}` : 'You\'re in'}
        </h1>
      </header>

      {/* Nickname inline edit */}
      <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 18, marginBottom: 20 }}>
        {!editingNick ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Nickname</p>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '4px 0 0' }}>{member.nickname ?? 'Anonymous'}</p>
            </div>
            <button onClick={() => { setNickname(member.nickname ?? ''); setEditingNick(true) }}
              style={{ background: 'transparent', border: '1px solid ' + C.border, color: C.textDim, padding: '8px 14px', borderRadius: RADIUS.sm, fontSize: 12, cursor: 'pointer', minHeight: 36, fontFamily: 'inherit' }}>
              Change
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Nickname" maxLength={40}
              style={{ flex: 1, padding: '10px 12px', background: C.surfaceHi, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
            <button onClick={saveNickname} disabled={saving}
              style={{ padding: '0 16px', background: C.accent, color: '#0d0d14', border: 'none', borderRadius: RADIUS.sm, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40, fontFamily: 'inherit' }}>
              Save
            </button>
            <button onClick={() => setEditingNick(false)}
              style={{ padding: '0 14px', background: 'transparent', color: C.textDim, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, fontSize: 13, cursor: 'pointer', minHeight: 40, fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        )}
      </section>

      {/* Follows */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>You follow ({follows.length})</h2>
        </div>
        {follows.length === 0 ? (
          <div style={{ background: C.surface, border: '1px dashed ' + C.border, borderRadius: RADIUS.lg, padding: 22, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: C.textDim, margin: 0, lineHeight: 1.5 }}>
              You&apos;re not following anyone yet. Visit a shop&apos;s page or scan their poster to follow.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {follows.map(f => (
              <article key={f.id} style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: RADIUS.pill,
                    background: f.businesses?.logo_url ? `url(${f.businesses.logo_url}) center/cover` : C.accentDeep,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.accent, fontWeight: 700, fontSize: 18, flexShrink: 0,
                    border: '1px solid ' + C.border,
                  }}>
                    {!f.businesses?.logo_url && (f.businesses?.name?.[0] ?? '?')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.businesses?.name ?? 'Business'}</p>
                    <p style={{ fontSize: 12, color: C.textMuted, margin: '2px 0 0' }}>
                      {f.businesses?.industry ?? 'shop'}{f.businesses?.city ? ' · ' + f.businesses.city : ''}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <PrefRow label="Notifications" value={f.notifications_on} onChange={v => togglePref(f.business_id, 'notifications_on', v)} hint="Push when this shop posts" />
                  <PrefRow label="Marketing messages" value={f.consent_marketing} onChange={v => togglePref(f.business_id, 'consent_marketing', v)} hint="Promos and special offers" />
                  <PrefRow label="Hide from feed" value={f.is_hidden} onChange={v => togglePref(f.business_id, 'is_hidden', v)} hint="Stay subscribed, hide their posts" />
                </div>

                <button onClick={() => unfollow(f.business_id)}
                  style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: C.danger, borderRadius: RADIUS.sm, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 }}>
                  Unfollow
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Footer actions */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8, borderTop: '1px solid ' + C.border, marginTop: 24 }}>
        <button onClick={leave} disabled={saving}
          style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid ' + C.border, color: C.textMuted, borderRadius: RADIUS.sm, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
          Leave the network
        </button>
        <p style={{ fontSize: 11, color: C.textMuted, margin: 0, lineHeight: 1.55, textAlign: 'center' }}>
          Identity (loyalty, points, your real name) only ever lives in-store at the shop — never here.
        </p>
      </section>
    </main>
  )
}

function PrefRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: C.surfaceHi, borderRadius: RADIUS.sm, cursor: 'pointer', minHeight: 44 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: C.text }}>{label}</p>
        {hint && <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>{hint}</p>}
      </div>
      <Toggle value={value} onChange={onChange} ariaLabel={label} />
    </label>
  )
}

function Toggle({ value, onChange, ariaLabel }: { value: boolean; onChange: (v: boolean) => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      onClick={() => onChange(!value)}
      style={{
        position: 'relative', width: 42, height: 24, borderRadius: 24,
        background: value ? C.accent : 'rgba(255,255,255,0.12)',
        border: 'none', cursor: 'pointer', transition: 'background 180ms',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 20 : 2,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 180ms',
      }} />
    </button>
  )
}
