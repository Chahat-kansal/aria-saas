'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { AriaSays } from '@/components/dashboard/AriaSays'
import { CommunityAnalytics, type CommunityAnalyticsData } from './CommunityAnalytics'
import {
  Plus, Sparkles, Image as ImageIcon, Video, Film, Clock, CalendarClock,
  Eye, EyeOff, Trash2, Send, Save, X, Loader2, AlertCircle, ChevronRight,
  type LucideIcon,
} from 'lucide-react'

// ── Theme tokens — same Financial Trust palette as the rest of the dashboard
const C = {
  bg: 'var(--bg-base)',
  card: 'var(--bg-surface)',
  surfaceHi: 'rgba(127,184,151,0.06)',
  border: 'rgba(127,184,151,0.15)',
  borderSoft: 'rgba(255,255,255,0.06)',
  text: 'var(--text-primary)',
  muted: 'var(--text-secondary)',
  dim: 'var(--text-tertiary)',
  green: '#7FB897',
  sage: '#2D5240',
  amber: '#F59E0B',
  red: '#EF4444',
  violet: '#A78BFA',
  blue: '#60A5FA',
}
const FONT = 'var(--font-ui, Inter, system-ui, sans-serif)'

type PostType = 'update' | 'offer' | 'new_stock' | 'event' | 'reel' | 'video' | 'story'
type MediaType = 'image' | 'video' | 'reel'
type Status = 'draft' | 'scheduled' | 'published' | 'archived'

interface Post {
  id: string
  post_type: PostType
  title: string | null
  body: string | null
  media_urls: string[]
  media_type: MediaType | null
  is_story: boolean
  expires_at: string | null
  is_expired?: boolean
  ai_generated: boolean
  scheduled_for: string | null
  published_at: string | null
  status: Status
  created_at: string
  updated_at: string
}

const TYPE_META: Record<PostType, { label: string; Icon: LucideIcon; color: string }> = {
  update:    { label: 'Update',    Icon: Send,    color: C.green  },
  offer:     { label: 'Offer',     Icon: Sparkles, color: C.amber },
  new_stock: { label: 'New stock', Icon: ImageIcon, color: C.green },
  event:     { label: 'Event',     Icon: CalendarClock, color: C.violet },
  reel:      { label: 'Reel',      Icon: Film,    color: C.violet },
  video:     { label: 'Video',     Icon: Video,   color: C.blue   },
  story:     { label: 'Story',     Icon: Clock,   color: C.amber  },
}

const STATUS_META: Record<Status, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: C.dim   },
  scheduled: { label: 'Scheduled', color: C.violet },
  published: { label: 'Live',      color: C.green },
  archived:  { label: 'Archived',  color: C.dim   },
}

const POST_TYPES: PostType[] = ['update', 'offer', 'new_stock', 'event', 'story', 'reel', 'video']

const blankForm = {
  post_type: 'update' as PostType,
  title: '',
  body: '',
  media_urls: [] as string[],
  media_type: null as MediaType | null,
  scheduled_for: '',
}

const fmtRel = (iso: string) => {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + 'm ago'
  if (diff < 86_400_000) return Math.floor(diff / 3600_000) + 'h ago'
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + 'd ago'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

const fmtExpiresIn = (iso: string | null): string | null => {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600_000)
  if (h >= 1) return `${h}h left`
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
  color: C.text, fontSize: 13, outline: 'none', fontFamily: FONT, boxSizing: 'border-box',
  minHeight: 40,
}

export default function CommunityOwnerPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [form, setForm] = useState({ ...blankForm })
  const [editId, setEditId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [analytics, setAnalytics] = useState<CommunityAnalyticsData | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // CX-OWNER-TRUST-1: fetch posts + analytics in parallel.
      const [postsRes, analyticsRes] = await Promise.all([
        fetch('/api/community/owner/posts').then(r => r.json()),
        fetch('/api/community/owner/analytics').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])
      setPosts(postsRes.posts ?? [])
      if (analyticsRes && !analyticsRes.error) setAnalytics(analyticsRes as CommunityAnalyticsData)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setForm({ ...blankForm })
    setEditId(null)
    setHint('')
    setError('')
  }

  function startEdit(p: Post) {
    setEditId(p.id)
    setForm({
      post_type: p.post_type,
      title: p.title ?? '',
      body: p.body ?? '',
      media_urls: p.media_urls ?? [],
      media_type: p.media_type,
      scheduled_for: p.scheduled_for ?? '',
    })
    setComposing(true)
    setHint('')
    setError('')
  }

  async function uploadFile(file: File) {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const kind: 'image' | 'video' | 'reel' = file.type.startsWith('video/')
        ? (form.post_type === 'reel' ? 'reel' : 'video')
        : 'image'
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      const res = await fetch('/api/community/owner/media', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Upload failed')
      setForm(f => ({
        ...f,
        media_urls: [...f.media_urls, d.url],
        media_type: kind,
      }))
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setUploading(false)
  }

  async function ariaDraft() {
    setDrafting(true)
    setError('')
    try {
      const res = await fetch('/api/community/owner/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_type: form.post_type, hint }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Draft failed')
      setForm(f => ({
        ...f,
        title: d.draft.title ?? f.title,
        body: d.draft.body ?? f.body,
      }))
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setDrafting(false)
  }

  async function save(targetStatus: Status) {
    setSaving(true)
    setError('')
    try {
      const isStory = form.post_type === 'story'
      const isReel = form.post_type === 'reel'
      if (isReel && form.media_urls.length === 0) throw new Error('Reels need a video.')
      if (!form.title && !form.body && form.media_urls.length === 0) {
        throw new Error('Add a title, body, or media before posting.')
      }
      const payload = {
        ...(editId ? { id: editId } : {}),
        post_type: form.post_type,
        title: form.title || null,
        body: form.body || null,
        media_urls: form.media_urls,
        media_type: isReel ? 'reel' : form.media_type,
        is_story: isStory,
        scheduled_for: targetStatus === 'scheduled' && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
        status: targetStatus,
      }
      const res = await fetch('/api/community/owner/posts', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Save failed')
      setComposing(false)
      resetForm()
      load()
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function changeStatus(id: string, status: Status) {
    await fetch('/api/community/owner/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this post permanently?')) return
    await fetch('/api/community/owner/posts?id=' + id, { method: 'DELETE' })
    load()
  }

  const filtered = filter === 'all' ? posts : posts.filter(p => p.status === filter)
  const counts = {
    all: posts.length,
    draft: posts.filter(p => p.status === 'draft').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    published: posts.filter(p => p.status === 'published' && !p.is_expired).length,
    archived: posts.filter(p => p.status === 'archived').length,
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto', color: C.text, fontFamily: FONT }}>
      <style jsx global>{`
        .community-card { transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease; }
        .community-card:hover { transform: translateY(-1px); border-color: ${C.green}40; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
        .community-pill-btn { transition: background 140ms, color 140ms, border-color 140ms; }
        .community-spin { animation: community-spin 1s linear infinite; }
        @keyframes community-spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .community-layout { grid-template-columns: 1fr !important; }
          .community-stats { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <AriaSays businessId={null} page="community" />

      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Aria Community</h1>
          <p style={{ fontSize: 13, color: C.dim, margin: '4px 0 0' }}>Post updates, offers, 24-hour stories, videos, and reels to your followers.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/dashboard/community/marketer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid rgba(167,139,250,0.4)`, background: 'rgba(167,139,250,0.08)', color: '#A78BFA', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, textDecoration: 'none' }}>
            <Sparkles size={14} /> Aria Marketer
          </a>
          <button
            onClick={() => { setComposing(true); resetForm() }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            <Plus size={15} /> New post
          </button>
        </div>
      </header>

      {/* CX-OWNER-TRUST-1 — community analytics (followers / reach / engagement / top posts / best times) */}
      {analytics ? (
        <CommunityAnalytics data={analytics} c={C} font={FONT} />
      ) : loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, height: 84 }} />
          ))}
        </div>
      ) : null}

      {/* Stats strip */}
      <div className="community-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Live now',   value: counts.published, color: C.green },
          { label: 'Scheduled',  value: counts.scheduled, color: C.violet },
          { label: 'Drafts',     value: counts.draft,     color: C.text },
          { label: 'Archived',   value: counts.archived,  color: C.dim },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: s.color, margin: '6px 0 0', letterSpacing: '-0.02em' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Compose panel (modal-style, inline) */}
      {composing && (
        <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{editId ? 'Edit post' : 'New post'}</h2>
            <button onClick={() => { setComposing(false); resetForm() }}
              style={{ background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', display: 'flex', padding: 6 }}>
              <X size={16} />
            </button>
          </div>

          {/* Type picker */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {POST_TYPES.map(t => {
              const m = TYPE_META[t]
              const active = form.post_type === t
              return (
                <button key={t} onClick={() => setForm(f => ({ ...f, post_type: t }))} className="community-pill-btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 34, padding: '0 14px', borderRadius: 999,
                    background: active ? m.color + '22' : 'transparent',
                    border: `1px solid ${active ? m.color : C.border}`,
                    color: active ? m.color : C.muted,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                  }}>
                  <m.Icon size={13} />
                  {m.label}
                </button>
              )
            })}
          </div>

          {/* Title (not for stories — they're one-liners) */}
          {form.post_type !== 'story' && (
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Title</span>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Something punchy and specific" maxLength={200} style={inp} />
            </label>
          )}

          {/* Body */}
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {form.post_type === 'story' ? 'Story (one line, max 25 words)' : 'Body'}
            </span>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder={form.post_type === 'story' ? 'e.g. Last hour — 20% off the deli case.' : 'Write naturally — keep it warm and specific.'}
              rows={form.post_type === 'story' ? 2 : 5}
              maxLength={4000}
              style={{ ...inp, height: 'auto', resize: 'vertical', lineHeight: 1.55, minHeight: form.post_type === 'story' ? 60 : 130 }} />
          </label>

          {/* AI draft */}
          <div style={{ padding: 12, background: 'rgba(167,139,250,0.06)', border: `1px solid rgba(167,139,250,0.2)`, borderRadius: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Sparkles size={14} style={{ color: C.violet }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Let Aria draft it</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={hint} onChange={e => setHint(e.target.value)}
                placeholder="Optional hint — e.g. push the new winter menu"
                maxLength={400} style={{ ...inp, flex: 1 }} />
              <button onClick={ariaDraft} disabled={drafting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.violet}55`, background: 'rgba(167,139,250,0.1)', color: C.violet, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                {drafting ? <Loader2 size={13} className="community-spin" /> : <Sparkles size={13} />}
                {drafting ? 'Drafting…' : 'Draft for me'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: C.dim, margin: '8px 0 0', lineHeight: 1.5 }}>Aria reads your real stock + recent sellers and writes a post grounded in that data.</p>
          </div>

          {/* Media */}
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Media</span>
            {form.media_urls.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 10 }}>
                {form.media_urls.map((url, i) => {
                  const isVideo = form.media_type === 'video' || form.media_type === 'reel'
                  return (
                    <div key={url} style={{ position: 'relative', aspectRatio: form.media_type === 'reel' ? '9 / 16' : '1', borderRadius: 10, overflow: 'hidden', background: '#000', border: `1px solid ${C.border}` }}>
                      {isVideo ? (
                        <video src={url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      <button onClick={() => setForm(f => ({ ...f, media_urls: f.media_urls.filter((_, j) => j !== i) }))}
                        style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={form.post_type === 'reel' || form.post_type === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm'}
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); if (e.target) e.target.value = '' }}
            />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
              {uploading ? <Loader2 size={14} className="community-spin" /> : (form.post_type === 'reel' || form.post_type === 'video' ? <Video size={14} /> : <ImageIcon size={14} />)}
              {uploading ? 'Uploading…' : (form.media_urls.length > 0 ? 'Add more' : (form.post_type === 'reel' ? 'Upload reel (vertical video)' : form.post_type === 'video' ? 'Upload video' : 'Upload image or video'))}
            </button>
          </div>

          {/* Schedule */}
          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: C.dim, display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Schedule for later (optional)</span>
            <input type="datetime-local" value={form.scheduled_for} onChange={e => setForm(f => ({ ...f, scheduled_for: e.target.value }))} style={inp} />
          </label>

          {error && (
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: C.red, fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => save('published')} disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: saving ? 0.6 : 1 }}>
              <Send size={14} /> Publish now
            </button>
            {form.scheduled_for && (
              <button onClick={() => save('scheduled')} disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 42, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.violet}55`, background: 'rgba(167,139,250,0.1)', color: C.violet, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                <CalendarClock size={14} /> Schedule
              </button>
            )}
            <button onClick={() => save('draft')} disabled={saving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 42, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              <Save size={14} /> Save as draft
            </button>
          </div>
        </section>
      )}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['all', 'published', 'scheduled', 'draft', 'archived'] as const).map(k => {
          const active = filter === k
          return (
            <button key={k} onClick={() => setFilter(k)} className="community-pill-btn"
              style={{
                height: 32, padding: '0 14px', borderRadius: 999,
                border: `1px solid ${active ? C.green : C.border}`,
                background: active ? 'rgba(127,184,151,0.1)' : 'transparent',
                color: active ? C.green : C.muted,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                textTransform: 'capitalize',
              }}>
              {k === 'all' ? 'All posts' : STATUS_META[k].label}
              {k === 'all' && counts.all > 0 && <span style={{ marginLeft: 6, opacity: 0.6 }}>{counts.all}</span>}
            </button>
          )
        })}
      </div>

      {/* Posts list */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          <Send size={28} style={{ color: C.dim, opacity: 0.5, marginBottom: 10 }} />
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>No posts here yet</p>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Click &quot;New post&quot; to start sharing with your community.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(p => {
            const tMeta = TYPE_META[p.post_type] ?? TYPE_META.update
            const sMeta = STATUS_META[p.status]
            const expiresLabel = fmtExpiresIn(p.expires_at)
            const isExpired = p.is_expired
            const firstMedia = p.media_urls?.[0]
            const isVideo = p.media_type === 'video' || p.media_type === 'reel'
            return (
              <div key={p.id} className="community-card" style={{
                padding: 14, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`,
                opacity: isExpired ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  {/* Media preview */}
                  {firstMedia && (
                    <div style={{ width: 96, height: 96, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#000', border: `1px solid ${C.border}` }}>
                      {isVideo ? (
                        <video src={firstMedia} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={firstMedia} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                  )}
                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: tMeta.color, padding: '2px 8px', borderRadius: 999, background: tMeta.color + '18', border: `1px solid ${tMeta.color}30` }}>
                        <tMeta.Icon size={11} /> {tMeta.label}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: sMeta.color, padding: '2px 8px', borderRadius: 999, background: sMeta.color + '18', border: `1px solid ${sMeta.color}30` }}>
                        {sMeta.label}
                      </span>
                      {p.ai_generated && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.violet }}>
                          <Sparkles size={10} /> Aria
                        </span>
                      )}
                      {expiresLabel && (
                        <span style={{ fontSize: 11, color: isExpired ? C.dim : C.amber, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> {expiresLabel}
                        </span>
                      )}
                    </div>
                    {p.title && <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{p.title}</p>}
                    {p.body && <p style={{ fontSize: 13, color: C.muted, margin: '0 0 8px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.body}</p>}
                    <p style={{ fontSize: 11, color: C.dim, margin: 0 }}>
                      {p.published_at ? `Published ${fmtRel(p.published_at)}` : p.scheduled_for ? `Scheduled for ${new Date(p.scheduled_for).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : `Updated ${fmtRel(p.updated_at)}`}
                    </p>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {p.status === 'published' && (
                      <button onClick={() => changeStatus(p.id, 'archived')} title="Archive"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                        <EyeOff size={12} /> Hide
                      </button>
                    )}
                    {(p.status === 'draft' || p.status === 'archived') && (
                      <button onClick={() => changeStatus(p.id, 'published')} title="Publish"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.green}55`, background: 'rgba(127,184,151,0.1)', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                        <Eye size={12} /> Publish
                      </button>
                    )}
                    <button onClick={() => startEdit(p)} title="Edit"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      <ChevronRight size={12} /> Edit
                    </button>
                    <button onClick={() => remove(p.id)} title="Delete"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
