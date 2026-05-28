'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { AriaSays } from '@/components/dashboard/AriaSays'
import { Globe, Check, Pencil, Trash2, ExternalLink, ChevronLeft, Loader2, AlertCircle, BadgeCheck } from 'lucide-react'

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)',
  border: 'rgba(127,184,151,0.15)', borderSoft: 'rgba(255,255,255,0.06)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#7FB897', sage: '#2D5240', red: '#EF4444',
}
const FONT = 'var(--font-ui, Inter, system-ui, sans-serif)'

interface Profile {
  id: string
  name: string | null
  website: string | null
  community_bio: string | null
  community_cover_url: string | null
  community_verified: boolean | null
  logo_url: string | null
  industry: string | null
  suburb: string | null
  city: string | null
}

function hostname(url: string | null): string | null {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export default function CommunityProfileDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingWebsite, setEditingWebsite] = useState(false)
  const [websiteInput, setWebsiteInput] = useState('')
  const [bioInput, setBioInput] = useState('')
  const [savingWebsite, setSavingWebsite] = useState(false)
  const [savingBio, setSavingBio] = useState(false)
  const [error, setError] = useState('')
  const [bioSaved, setBioSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/community/owner/profile').then(r => r.json())
      if (d.profile) {
        setProfile(d.profile)
        setBioInput(d.profile.community_bio ?? '')
        setWebsiteInput(d.profile.website ?? '')
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveWebsite(value: string | null) {
    setSavingWebsite(true)
    setError('')
    try {
      const res = await fetch('/api/community/owner/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: value }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not save')
      setProfile(p => p ? { ...p, website: d.website ?? null } : p)
      setEditingWebsite(false)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setSavingWebsite(false)
  }

  async function saveBio() {
    setSavingBio(true)
    setError('')
    try {
      const res = await fetch('/api/community/owner/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ community_bio: bioInput }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not save')
      setProfile(p => p ? { ...p, community_bio: bioInput } : p)
      setBioSaved(true); setTimeout(() => setBioSaved(false), 2400)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setSavingBio(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 13px', borderRadius: 9,
    background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: 'none', fontFamily: FONT, boxSizing: 'border-box', minHeight: 42,
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760, margin: '0 auto', color: C.text, fontFamily: FONT }}>
      <Link href="/dashboard/community" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted, marginBottom: 14, textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Aria Community
      </Link>

      <AriaSays businessId={null} page="community-profile" />

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Community profile</h1>
        <p style={{ fontSize: 13, color: C.dim, margin: '4px 0 0' }}>How your shop appears to customers browsing Aria Community.</p>
      </header>

      {loading ? (
        <p style={{ color: C.dim, padding: 24, textAlign: 'center' }}>Loading…</p>
      ) : !profile ? (
        <p style={{ color: C.dim, padding: 24, textAlign: 'center' }}>No active business found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Identity card */}
          <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: profile.logo_url ? `url(${profile.logo_url}) center/cover` : C.sage,
              color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 22, flexShrink: 0,
            }}>
              {!profile.logo_url && (profile.name?.[0] ?? '?')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                {profile.name}
                {profile.community_verified && <BadgeCheck size={15} style={{ color: C.green }} />}
              </p>
              <p style={{ fontSize: 12, color: C.dim, margin: '3px 0 0' }}>
                {profile.industry ?? 'shop'}{(profile.suburb || profile.city) ? ' · ' + (profile.suburb ?? profile.city) : ''}
              </p>
            </div>
            <Link href={`/community/businesses/${profile.id}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: C.green, textDecoration: 'none', flexShrink: 0 }}>
              <ExternalLink size={13} /> View
            </Link>
          </section>

          {/* Website */}
          <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Globe size={16} style={{ color: C.green }} />
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Website</h2>
            </div>
            <p style={{ fontSize: 12, color: C.dim, margin: '0 0 14px', lineHeight: 1.5 }}>
              Shown as a tappable chip on your community profile. Opens in a new tab. https is enforced for safety.
            </p>

            {!profile.website && !editingWebsite ? (
              <div>
                <button onClick={() => { setEditingWebsite(true); setWebsiteInput('') }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 9, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  <Globe size={14} /> Attach your website
                </button>
              </div>
            ) : editingWebsite ? (
              <div>
                <input
                  value={websiteInput}
                  onChange={e => { setWebsiteInput(e.target.value); setError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && !savingWebsite) saveWebsite(websiteInput) }}
                  placeholder="yourshop.com.au"
                  style={inp}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => saveWebsite(websiteInput)} disabled={savingWebsite || !websiteInput.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 9, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: savingWebsite || !websiteInput.trim() ? 0.6 : 1 }}>
                    {savingWebsite ? <Loader2 size={14} className="community-spin" /> : <Check size={14} />} Save
                  </button>
                  <button onClick={() => { setEditingWebsite(false); setWebsiteInput(profile.website ?? ''); setError('') }}
                    style={{ height: 40, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <a href={profile.website!} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: C.green, textDecoration: 'none', background: 'rgba(127,184,151,0.1)', padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.green}44` }}>
                  <Globe size={14} /> {hostname(profile.website)}
                </a>
                <button onClick={() => { setEditingWebsite(true); setWebsiteInput(profile.website ?? '') }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => saveWebsite(null)} disabled={savingWebsite}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            )}
            {error && (
              <p style={{ fontSize: 12, color: C.red, margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} /> {error}
              </p>
            )}
          </section>

          {/* Bio */}
          <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Bio</h2>
            <p style={{ fontSize: 12, color: C.dim, margin: '0 0 12px' }}>One or two lines under your name. {280 - bioInput.length} characters left.</p>
            <textarea value={bioInput} onChange={e => setBioInput(e.target.value.slice(0, 280))} rows={3}
              placeholder="single-origin coffee, fresh pastries every morning."
              style={{ ...inp, height: 'auto', resize: 'vertical', minHeight: 72, lineHeight: 1.5 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button onClick={saveBio} disabled={savingBio}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 9, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: savingBio ? 0.6 : 1 }}>
                {savingBio ? <Loader2 size={14} className="community-spin" /> : <Check size={14} />} Save bio
              </button>
              {bioSaved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Saved</span>}
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`@keyframes community-spin { to { transform: rotate(360deg); } } .community-spin { animation: community-spin 1s linear infinite; }`}</style>
    </div>
  )
}
