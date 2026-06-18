'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { C, RADIUS, MAX_W, FONT_DISPLAY, SIGNAL_COLORS } from '../theme'
import { PushOptIn } from '../PushOptIn'
import { supabase } from '@/lib/supabase'

type NotifPrefKey = 'notif_pref_likes' | 'notif_pref_comments' | 'notif_pref_followers' | 'notif_pref_new_posts'
interface Member {
  id: string; nickname: string | null; joined_at: string
  avatar_url?: string | null; bio?: string | null
  notif_pref_likes?: boolean; notif_pref_comments?: boolean; notif_pref_followers?: boolean; notif_pref_new_posts?: boolean
}
interface BlockedBiz { business_id: string; created_at: string; businesses: { name: string | null; logo_url: string | null } | null }
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
  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null)
  const [accountLinked, setAccountLinked] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeEmail, setUpgradeEmail] = useState('')
  const [upgradePassword, setUpgradePassword] = useState('')
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  // CX-ACCOUNT-CENTRE-1
  const [bioInput, setBioInput] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [bioSaved, setBioSaved] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  // CX-ACCOUNT-CENTRE-2
  const [stats, setStats] = useState<{ following: number; saved: number; liked: number; comments: number; messaged: number } | null>(null)
  const [exportData, setExportData] = useState<unknown | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [defaultFeed, setDefaultFeedState] = useState<'foryou' | 'following'>('foryou')
  const [pwReset, setPwReset] = useState('')
  const [blocks, setBlocks] = useState<BlockedBiz[]>([])
  const avatarFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const df = window.localStorage.getItem('aria-community-default-feed')
      if (df === 'following' || df === 'foryou') setDefaultFeedState(df)
    }
    (async () => {
      const [d, authData] = await Promise.all([
        fetch('/api/community/follows').then(r => r.json()),
        supabase.auth.getUser(),
      ])
      setMember(d.member ?? null)
      setFollows(d.follows ?? [])
      if (d.member) {
        setBioInput(d.member.bio ?? '')
        // Activity counts + full export data (own data, member-scoped) + blocked businesses.
        fetch('/api/community/me/export').then(r => r.ok ? r.json() : null).then(p => {
          if (p) { setStats(p.activity); setExportData(p) }
        }).catch(() => {})
        fetch('/api/community/block').then(r => r.ok ? r.json() : null).then(b => { if (b?.blocks) setBlocks(b.blocks) }).catch(() => {})
      }
      if (authData.data.user) {
        setAuthUser({ id: authData.data.user.id, email: authData.data.user.email })
        // Check if community session is already linked to this auth user
        const linkStatus = await fetch('/api/community/account-link').then(r => r.json())
        setAccountLinked(!!linkStatus.linked)
      }
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

  async function upgradeAccount() {
    setUpgrading(true)
    setUpgradeError(null)
    try {
      const { data, error } = await supabase.auth.signUp({ email: upgradeEmail.trim(), password: upgradePassword })
      if (error) { setUpgradeError(error.message); return }
      if (data.user) {
        setAuthUser({ id: data.user.id, email: data.user.email ?? undefined })
        const link = await fetch('/api/community/account-link', { method: 'POST' }).then(r => r.json())
        if (link.ok) { setAccountLinked(true); setShowUpgrade(false) }
      }
    } finally {
      setUpgrading(false)
    }
  }

  async function signInAndLink() {
    setUpgrading(true)
    setUpgradeError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: upgradeEmail.trim(), password: upgradePassword })
      if (error) { setUpgradeError(error.message); return }
      if (data.user) {
        setAuthUser({ id: data.user.id, email: data.user.email ?? undefined })
        const link = await fetch('/api/community/account-link', { method: 'POST' }).then(r => r.json())
        if (link.ok) { setAccountLinked(true); setShowUpgrade(false) }
      }
    } finally {
      setUpgrading(false)
    }
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

  // CX-ACCOUNT-CENTRE-1 handlers
  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/community/members/avatar', { method: 'POST', body: fd })
      const d = await res.json()
      if (res.ok && d.avatar_url) setMember(m => m ? { ...m, avatar_url: d.avatar_url } : m)
    } catch { /* keep current avatar */ }
    setAvatarUploading(false)
  }

  async function saveBio() {
    setSavingBio(true)
    await fetch('/api/community/session', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: bioInput }),
    }).catch(() => {})
    setMember(m => m ? { ...m, bio: bioInput.trim() || null } : m)
    setBioSaved(true); setTimeout(() => setBioSaved(false), 2000)
    setSavingBio(false)
  }

  async function toggleNotifPref(key: NotifPrefKey, value: boolean) {
    setMember(m => m ? { ...m, [key]: value } : m) // optimistic
    await fetch('/api/community/session', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {})
  }

  async function unblock(business_id: string) {
    await fetch('/api/community/block?business_id=' + business_id, { method: 'DELETE' }).catch(() => {})
    setBlocks(prev => prev.filter(b => b.business_id !== business_id))
  }

  // CX-ACCOUNT-CENTRE-2 handlers
  async function downloadMyData() {
    setDownloading(true)
    try {
      // Use the already-loaded export, or fetch fresh.
      const data = exportData ?? await fetch('/api/community/me/export').then(r => r.ok ? r.json() : null).catch(() => null)
      if (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'aria-community-data.json'
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(url)
      }
    } catch { /* no-op */ }
    setDownloading(false)
  }

  function setDefaultFeed(v: 'foryou' | 'following') {
    setDefaultFeedState(v)
    if (typeof window !== 'undefined') window.localStorage.setItem('aria-community-default-feed', v)
  }

  async function changePassword() {
    const email = authUser?.email
    if (!email) return
    await supabase.auth.resetPasswordForEmail(email).catch(() => {})
    setPwReset('Password reset link sent to ' + email)
    setTimeout(() => setPwReset(''), 4000)
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
          <h1 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.12, margin: '8px 0 10px', fontFamily: FONT_DISPLAY }}>
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
              background: C.accent, color: C.ink, fontSize: 15, fontWeight: 700,
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

  // ─── JOINED — Account Centre ────────────────────────────────────
  const secLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textMuted, margin: '0 0 8px' }
  const maskedEmail = authUser?.email ? authUser.email[0] + '***@' + (authUser.email.split('@')[1] ?? '') : ''
  const dispName = member.nickname ?? 'Anonymous'
  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '32px 20px 64px' }}>
      <header style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Account Centre</p>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 0', fontFamily: FONT_DISPLAY }}>
              {member.nickname ? 'Hi ' + member.nickname : 'You\'re in'}
            </h1>
          </div>
          <Link href="/community/live/broadcast" prefetch={false}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: C.danger, color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 800, textDecoration: 'none', letterSpacing: '0.04em', flexShrink: 0, marginTop: 8 }}>
            &#9679; Go Live
          </Link>
        </div>
      </header>

      {/* ════ DATA PERSISTENCE BANNER ════ */}
      {!accountLinked ? (
        <div style={{ background: 'rgba(186,117,23,0.08)', border: `1.5px solid ${SIGNAL_COLORS.promo}`, borderRadius: RADIUS.lg, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: C.ink }}>You&apos;re browsing anonymously</p>
            <p style={{ fontSize: 12, color: C.textMuted, margin: '2px 0 0', lineHeight: 1.4 }}>Your follows live on this device only. Create an account to keep them forever.</p>
          </div>
          <button onClick={() => setShowUpgrade(true)} style={{ flexShrink: 0, padding: '8px 14px', background: C.accent, color: C.ink, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Create account</button>
        </div>
      ) : (
        <div style={{ background: C.surfaceHi, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, color: C.accent }}>✓</span>
          <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: C.text }}>Account synced{maskedEmail ? ' — ' + maskedEmail : ''}. Your data is saved across devices.</p>
        </div>
      )}

      {/* ════ SECTION 1 — IDENTITY ════ */}
      <p style={secLabel}>Identity</p>
      <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 18, marginBottom: 22 }}>
        <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarPick} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <button onClick={() => avatarFileRef.current?.click()} disabled={avatarUploading} aria-label="Change avatar"
            style={{ position: 'relative', width: 80, height: 80, borderRadius: '50%', flexShrink: 0, padding: 0, cursor: 'pointer',
              background: member.avatar_url ? `url(${member.avatar_url}) center/cover` : C.accent,
              border: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.ink, fontWeight: 800, fontSize: 30 }}>
            {!member.avatar_url && dispName[0]?.toUpperCase()}
            <span style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: C.ink, color: C.accent, border: '2px solid ' + C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>
              {avatarUploading ? '…' : '+'}
            </span>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!editingNick ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dispName}</p>
                <button onClick={() => { setNickname(member.nickname ?? ''); setEditingNick(true) }}
                  style={{ background: 'transparent', border: '1px solid ' + C.border, color: C.textDim, padding: '5px 11px', borderRadius: RADIUS.sm, fontSize: 11, cursor: 'pointer', minHeight: 30, fontFamily: 'inherit', flexShrink: 0 }}>Edit</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Nickname" maxLength={40}
                  style={{ flex: 1, padding: '8px 10px', background: C.surfaceHi, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                <button onClick={saveNickname} disabled={saving}
                  style={{ padding: '0 12px', background: C.accent, color: C.ink, border: 'none', borderRadius: RADIUS.sm, fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36, fontFamily: 'inherit' }}>Save</button>
                <button onClick={() => setEditingNick(false)}
                  style={{ padding: '0 10px', background: 'transparent', color: C.textDim, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, fontSize: 12, cursor: 'pointer', minHeight: 36, fontFamily: 'inherit' }}>✕</button>
              </div>
            )}
            {/* Activity stats */}
            {stats && (
              <p style={{ fontSize: 12, color: C.textMuted, margin: '6px 0 0' }}>
                <b style={{ color: C.text }}>{stats.following}</b> following · <b style={{ color: C.text }}>{stats.saved}</b> saved · <b style={{ color: C.text }}>{stats.liked}</b> liked
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        <p style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Bio</p>
        <textarea value={bioInput} onChange={e => setBioInput(e.target.value.slice(0, 160))} rows={2}
          placeholder="Tell locals a bit about yourself…"
          style={{ width: '100%', padding: '10px 12px', background: C.surfaceHi, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button onClick={saveBio} disabled={savingBio || bioInput === (member.bio ?? '')}
            style={{ padding: '8px 16px', background: C.accent, color: C.ink, border: 'none', borderRadius: RADIUS.sm, fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36, fontFamily: 'inherit', opacity: savingBio || bioInput === (member.bio ?? '') ? 0.5 : 1 }}>
            {savingBio ? 'Saving…' : 'Save bio'}
          </button>
          {bioSaved && <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>✓ Saved</span>}
          <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>{bioInput.length}/160</span>
        </div>
        <Link href={`/community/u/${member.id}`} prefetch={false} style={{ display: 'inline-block', marginTop: 12, fontSize: 12, fontWeight: 700, color: C.accent, textDecoration: 'none' }}>
          View public profile →
        </Link>
      </section>

      {/* ════ YOUR ACTIVITY ════ */}
      {stats && (
        <>
          <p style={secLabel}>Your activity</p>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
            {([
              { label: 'following', value: stats.following, href: undefined },
              { label: 'saved', value: stats.saved, href: '/community/saved' },
              { label: 'liked', value: stats.liked, href: undefined },
              { label: 'comments', value: stats.comments, href: undefined },
              { label: 'messaged', value: stats.messaged, href: '/community/market/chats' },
            ] as const).map(t => {
              const inner = (
                <>
                  <p style={{ fontSize: 20, fontWeight: 800, margin: 0, color: C.text }}>{t.value}</p>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, margin: '2px 0 0' }}>{t.label}</p>
                </>
              )
              const tileStyle: React.CSSProperties = { background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.md, padding: '12px 10px', textAlign: 'center', textDecoration: 'none', color: C.text }
              return t.href
                ? <Link key={t.label} href={t.href} prefetch={false} style={tileStyle}>{inner}</Link>
                : <div key={t.label} style={tileStyle}>{inner}</div>
            })}
          </section>
        </>
      )}

      {/* ════ SECTION 2 — ACCOUNT ════ */}
      <p style={secLabel}>Account</p>
      {!accountLinked && !authUser && (
        <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 18, marginBottom: 14 }}>
          {!showUpgrade ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Link an account</p>
                <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0', lineHeight: 1.5 }}>
                  Keep your follows across devices. Still anonymous to businesses.
                </p>
              </div>
              <button onClick={() => setShowUpgrade(true)}
                style={{ padding: '9px 16px', background: C.accent, color: C.ink, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, minHeight: 40 }}>
                Link
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Link an account</p>
              <input value={upgradeEmail} onChange={e => setUpgradeEmail(e.target.value)} placeholder="Email address" type="email"
                style={{ width: '100%', padding: '10px 12px', background: C.surfaceHi, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 8 }} />
              <input value={upgradePassword} onChange={e => setUpgradePassword(e.target.value)} placeholder="Password (min 8 chars)" type="password"
                style={{ width: '100%', padding: '10px 12px', background: C.surfaceHi, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 8 }} />
              {upgradeError && <p style={{ fontSize: 12, color: C.danger, margin: '0 0 8px' }}>{upgradeError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={upgradeAccount} disabled={upgrading || !upgradeEmail || !upgradePassword}
                  style={{ flex: 1, padding: '11px', background: C.accent, color: C.ink, border: 'none', borderRadius: RADIUS.sm, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: upgrading ? 0.6 : 1 }}>
                  {upgrading ? 'Linking…' : 'Create account'}
                </button>
                <button onClick={signInAndLink} disabled={upgrading || !upgradeEmail || !upgradePassword}
                  style={{ flex: 1, padding: '11px', background: 'transparent', color: C.text, border: '1px solid ' + C.border, borderRadius: RADIUS.sm, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: upgrading ? 0.6 : 1 }}>
                  Sign in
                </button>
              </div>
              <button onClick={() => setShowUpgrade(false)} style={{ marginTop: 8, background: 'none', border: 'none', color: C.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>Cancel</button>
            </div>
          )}
        </section>
      )}
      {(accountLinked || authUser) && (
        <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>✓</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Linked{maskedEmail ? ' — ' + maskedEmail : ''}</p>
              <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>Your follows sync across devices.</p>
            </div>
          </div>
          <button onClick={changePassword} style={{ marginTop: 10, background: 'transparent', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: C.accent, cursor: 'pointer', fontFamily: 'inherit' }}>
            Change password →
          </button>
          {pwReset && <p style={{ fontSize: 11, color: C.accent, margin: '6px 0 0', fontWeight: 600 }}>{pwReset}</p>}
        </section>
      )}
      <Link href="/community/saved" prefetch={false} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: RADIUS.lg,
        padding: '14px 16px', marginBottom: 10, textDecoration: 'none', color: C.text,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>saved offers</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>→</span>
      </Link>
      {/* Download my data (AU Privacy Act APP) */}
      <button onClick={downloadMyData} disabled={downloading} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg,
        padding: '14px 16px', marginBottom: 22, cursor: downloading ? 'wait' : 'pointer', fontFamily: 'inherit', color: C.text, opacity: downloading ? 0.6 : 1,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>{downloading ? 'preparing…' : 'download my data'}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>↓</span>
      </button>

      {/* ════ SECTION 3 — NOTIFICATIONS ════ */}
      <p style={secLabel}>Notifications</p>
      <div style={{ marginBottom: 12 }}>
        <PushOptIn />
      </div>
      <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 16, marginBottom: 22 }}>
        <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 10px', lineHeight: 1.5 }}>Choose what reaches you — applies to your in-app alerts and push.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PrefRow label="Likes on your posts" value={member.notif_pref_likes !== false} onChange={v => toggleNotifPref('notif_pref_likes', v)} />
          <PrefRow label="Comments" value={member.notif_pref_comments !== false} onChange={v => toggleNotifPref('notif_pref_comments', v)} />
          <PrefRow label="New followers" value={member.notif_pref_followers !== false} onChange={v => toggleNotifPref('notif_pref_followers', v)} />
          <PrefRow label="New posts from shops you follow" value={member.notif_pref_new_posts !== false} onChange={v => toggleNotifPref('notif_pref_new_posts', v)} />
        </div>
      </section>

      {/* ════ PREFERENCES ════ */}
      <p style={secLabel}>Preferences</p>
      <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 16, marginBottom: 22 }}>
        <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Default feed</p>
        <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 12px', lineHeight: 1.5 }}>Which tab the feed opens on.</p>
        <div style={{ display: 'flex', gap: 6, padding: 4, background: C.surfaceHi, borderRadius: RADIUS.md, border: '1px solid ' + C.border }}>
          {([['foryou', 'For You'], ['following', 'Following']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setDefaultFeed(v)} style={{
              flex: 1, padding: '8px 0', border: 'none', borderRadius: RADIUS.sm,
              background: defaultFeed === v ? C.accent : 'transparent', color: C.ink,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>{label}</button>
          ))}
        </div>
      </section>

      {/* ════ SECTION 4 — PRIVACY ════ */}
      <p style={secLabel}>Privacy &amp; safety</p>
      <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, padding: 16, marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Your follows are private</p>
        <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0', lineHeight: 1.5 }}>
          Who you follow is never shown publicly in Aria. Only your nickname and activity counts appear on your public profile.
        </p>
        <p style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 0' }}>Who can see my profile</p>
        <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0', lineHeight: 1.5 }}>
          Your profile is only visible when you comment on a post — someone can tap your nickname there. You&apos;re never searchable, suggested, or browsable. Aria Community is for discovering shops, not people.
        </p>
        {blocks.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Blocked businesses ({blocks.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blocks.map(b => (
                <div key={b.business_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surfaceHi, borderRadius: RADIUS.sm, padding: '8px 10px' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.businesses?.name ?? 'Business'}</span>
                  <button onClick={() => unblock(b.business_id)}
                    style={{ background: 'transparent', border: '1px solid ' + C.border, color: C.textDim, padding: '5px 11px', borderRadius: RADIUS.sm, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Unblock</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <p style={{ fontSize: 11, color: C.textMuted, margin: '14px 0 0', lineHeight: 1.5 }}>
          To block a business, open its profile and choose Block. Blocking hides their posts and stops all messages.
        </p>
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        <button onClick={leave} disabled={saving}
          style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: C.danger, borderRadius: RADIUS.sm, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
          Leave the network
        </button>
        <p style={{ fontSize: 11, color: C.textMuted, margin: 0, lineHeight: 1.55, textAlign: 'center' }}>
          Identity (loyalty, points, your real name) only ever lives in-store at the shop — never here.
        </p>
      </section>

      {/* ════ SECTION 5 — FOLLOWING ════ */}
      <p style={secLabel}>Businesses you follow ({follows.length})</p>
      <section style={{ marginBottom: 24 }}>
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

      {/* ════ SUPPORT / ABOUT ════ */}
      <p style={secLabel}>Support &amp; about</p>
      <section style={{ background: C.surface, border: '1px solid ' + C.border, borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: 16 }}>
        {([
          { label: 'Privacy policy', href: '/privacy', external: false },
          { label: 'Terms', href: '/terms', external: false },
          { label: 'Report a problem', href: 'mailto:support@ariaos.site?subject=Aria%20Community', external: true },
        ] as const).map((row, i) => (
          row.external ? (
            <a key={row.label} href={row.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', textDecoration: 'none', color: C.text, borderTop: i === 0 ? 'none' : '1px solid ' + C.border }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontSize: 13, color: C.inkSoft }}>→</span>
            </a>
          ) : (
            <Link key={row.label} href={row.href} prefetch={false} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', textDecoration: 'none', color: C.text, borderTop: i === 0 ? 'none' : '1px solid ' + C.border }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontSize: 13, color: C.inkSoft }}>→</span>
            </Link>
          )
        ))}
      </section>
      <p style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', margin: '0 0 8px', lineHeight: 1.5 }}>
        Aria Community — local shops, one feed. Promotion, not connection: discover businesses, never browse people.
      </p>
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
