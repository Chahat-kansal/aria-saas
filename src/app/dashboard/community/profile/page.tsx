'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { AriaSays } from '@/components/dashboard/AriaSays'
import { SitePreviewCard } from '@/components/SitePreviewCard'
import type { SitePreviewResult } from '@/app/api/site-preview/route'
import { Globe, Check, Pencil, Trash2, ExternalLink, ChevronLeft, Loader2, AlertCircle, BadgeCheck, Plus, Star } from 'lucide-react'

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
  phone: string | null
  address: string | null
}

interface Highlight { id: string; title: string; cover_url: string | null; post_ids: string[]; display_order?: number }

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
  const [preview, setPreview] = useState<SitePreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  // CX-OWNER-TRUST-2 — story highlights
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [hlTitle, setHlTitle] = useState('')
  const [hlBusy, setHlBusy] = useState(false)
  const [hlError, setHlError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profRes, hlRes] = await Promise.all([
        fetch('/api/community/owner/profile').then(r => r.json()),
        fetch('/api/community/owner/highlights').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])
      if (profRes.profile) {
        setProfile(profRes.profile)
        setBioInput(profRes.profile.community_bio ?? '')
        setWebsiteInput(profRes.profile.website ?? '')
      }
      if (hlRes?.highlights) setHighlights(hlRes.highlights)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  async function createHighlight() {
    const title = hlTitle.trim()
    if (!title || hlBusy) return
    setHlBusy(true); setHlError('')
    try {
      const res = await fetch('/api/community/owner/highlights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, use_latest_story: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not create highlight')
      setHighlights(h => [...h, d.highlight as Highlight])
      setHlTitle('')
    } catch (e) { setHlError((e as Error).message) }
    setHlBusy(false)
  }

  async function deleteHighlight(id: string) {
    setHighlights(h => h.filter(x => x.id !== id))
    await fetch('/api/community/owner/highlights?id=' + id, { method: 'DELETE' }).catch(() => {})
  }

  useEffect(() => { load() }, [load])

  // Confirm-before-save: fetch a live preview so the owner verifies it's really their site.
  async function startPreview() {
    const url = websiteInput.trim()
    if (!url) return
    setPreviewing(true); setError(''); setPreview(null)
    try {
      const res = await fetch('/api/site-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      })
      setPreview((await res.json()) as SitePreviewResult)
    } catch { setError('Network error — please try again') }
    setPreviewing(false)
  }

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
      setPreview(null)
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

  // CX-OWNER-TRUST-2 — profile completeness (6 public-facing fields). bio + website are editable on
  // this page; logo/cover/phone/address are edited in dashboard settings.
  const completeFields = profile ? [
    { label: 'Add your logo', filled: !!profile.logo_url, href: '/dashboard/settings' as string | null },
    { label: 'Add a cover photo', filled: !!profile.community_cover_url, href: '/dashboard/settings' as string | null },
    { label: 'Write a short bio', filled: !!profile.community_bio, href: null as string | null },
    { label: 'Add your phone number', filled: !!profile.phone, href: '/dashboard/settings' as string | null },
    { label: 'Add your address', filled: !!profile.address, href: '/dashboard/settings' as string | null },
    { label: 'Attach your website', filled: !!profile.website, href: null as string | null },
  ] : []
  const completeCount = completeFields.filter(f => f.filled).length
  const completePct = completeFields.length ? Math.round((completeCount / completeFields.length) * 100) : 0

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

          {/* CX-OWNER-TRUST-2 — profile completeness */}
          <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Profile completeness</h2>
              <span style={{ fontSize: 13, fontWeight: 700, color: completeCount === completeFields.length ? C.green : C.muted }}>{completeCount} of {completeFields.length} complete</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'rgba(127,184,151,0.12)', overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ height: '100%', width: `${completePct}%`, background: C.green, borderRadius: 999, transition: 'width 240ms' }} />
            </div>
            {completeCount === completeFields.length ? (
              <p style={{ fontSize: 13, color: C.green, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} /> Your profile is fully complete — nice work.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {completeFields.filter(f => !f.filled).map((f, i) => (
                  f.href ? (
                    <Link key={i} href={f.href} style={{ fontSize: 13, color: C.green, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {f.label} →
                    </Link>
                  ) : (
                    <span key={i} style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{f.label} <span style={{ color: C.dim, fontWeight: 500 }}>— edit below ↓</span></span>
                  )
                ))}
              </div>
            )}
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
                {preview && (
                  <div style={{ marginBottom: 12 }}>
                    <SitePreviewCard
                      result={preview}
                      busy={savingWebsite}
                      onConfirm={() => saveWebsite(preview.ok ? preview.finalUrl : websiteInput.trim())}
                      onReject={() => setPreview(null)}
                    />
                  </div>
                )}
                <input
                  value={websiteInput}
                  onChange={e => { setWebsiteInput(e.target.value); setError(''); setPreview(null) }}
                  onKeyDown={e => { if (e.key === 'Enter' && !previewing) startPreview() }}
                  placeholder="yourshop.com.au"
                  style={inp}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={startPreview} disabled={previewing || !websiteInput.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 9, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: previewing || !websiteInput.trim() ? 0.6 : 1 }}>
                    {previewing ? <Loader2 size={14} className="community-spin" /> : <Check size={14} />} {previewing ? 'Fetching…' : 'Preview & confirm'}
                  </button>
                  <button onClick={() => { setEditingWebsite(false); setWebsiteInput(profile.website ?? ''); setError(''); setPreview(null) }}
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

          {/* CX-OWNER-TRUST-2 — story highlights */}
          <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Star size={16} style={{ color: C.green }} />
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Story highlights</h2>
            </div>
            <p style={{ fontSize: 12, color: C.dim, margin: '0 0 14px', lineHeight: 1.5 }}>
              Pin your best stories to your profile so they don&apos;t disappear after 24 hours. Shown as circles above your posts.
            </p>

            {highlights.length > 0 && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                {highlights.map(h => (
                  <div key={h.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 64 }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: h.cover_url ? `url(${h.cover_url}) center/cover` : C.sage,
                        border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: C.green, fontWeight: 800, fontSize: 18,
                      }}>
                        {!h.cover_url && (h.title?.[0]?.toUpperCase() ?? '★')}
                      </div>
                      <button onClick={() => deleteHighlight(h.id)} aria-label="Delete highlight"
                        style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', border: 'none', background: C.red, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginTop: 5, maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={hlTitle} onChange={e => { setHlTitle(e.target.value.slice(0, 32)); setHlError('') }}
                onKeyDown={e => { if (e.key === 'Enter' && !hlBusy) createHighlight() }}
                placeholder="Highlight title (e.g. Winter Specials)" maxLength={32}
                style={{ ...inp, width: 'auto', flex: 1, minWidth: 200 }} />
              <button onClick={createHighlight} disabled={hlBusy || !hlTitle.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 42, padding: '0 16px', borderRadius: 9, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: hlBusy || !hlTitle.trim() ? 0.6 : 1 }}>
                {hlBusy ? <Loader2 size={14} className="community-spin" /> : <Plus size={14} />} Use latest story
              </button>
            </div>
            <p style={{ fontSize: 11, color: C.dim, margin: '8px 0 0' }}>Creates a highlight from your most recent 24-hour story.</p>
            {hlError && (
              <p style={{ fontSize: 12, color: C.red, margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} /> {hlError}
              </p>
            )}
          </section>
        </div>
      )}

      <style jsx global>{`@keyframes community-spin { to { transform: rotate(360deg); } } .community-spin { animation: community-spin 1s linear infinite; }`}</style>
    </div>
  )
}
