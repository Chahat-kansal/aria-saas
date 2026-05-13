'use client'
import { useState, useEffect, useCallback } from 'react'
import { formatSlotDay, formatSlotTime } from '@/lib/social/smart-scheduler'

const PLATFORM_COLORS: Record<string, string> = {
  instagram:       '#E1306C',
  facebook:        '#1877F2',
  google_business: '#4285F4',
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram:       '📸',
  facebook:        '👍',
  google_business: '🌐',
}

const STATUS_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: 'Draft',        color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  scheduled:  { label: 'Scheduled',    color: '#7FB897', bg: 'rgba(127,184,151,0.1)' },
  publishing: { label: 'Publishing...', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  published:  { label: 'Published',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  failed:     { label: 'Failed',       color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
}

interface SocialPost {
  id: string
  platform: string
  caption: string
  hashtags: string[]
  image_urls: string[]
  status: string
  approval_status: string
  scheduled_for: string | null
  published_at: string | null
  platform_url: string | null
  publish_error: string | null
  owner_request: string | null
  ai_generated: boolean
  created_at: string
}

export function ContentCalendar({
  businessId,
  industry,
  activePlatforms,
}: {
  businessId: string
  industry: string
  activePlatforms: string[]
}) {
  const [posts,          setPosts]          = useState<SocialPost[]>([])
  const [loading,        setLoading]        = useState(true)
  const [generating,     setGenerating]     = useState(false)
  const [publishing,     setPublishing]     = useState<string | null>(null)
  const [requestText,    setRequestText]    = useState('')
  const [scheduleKind,   setScheduleKind]   = useState<'asap' | 'specific_date' | 'recurring'>('asap')
  const [specificDate,   setSpecificDate]   = useState('')
  const [recurrence,     setRecurrence]     = useState('')
  const [submittingReq,  setSubmittingReq]  = useState(false)
  const [editingPost,    setEditingPost]    = useState<string | null>(null)
  const [editCaption,    setEditCaption]    = useState('')
  const [weekOffset,     setWeekOffset]     = useState(0)

  const getWeekDays = useCallback(() => {
    const now = new Date()
    now.setDate(now.getDate() + weekOffset * 7)
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay() + 1) // Monday
    start.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [weekOffset])

  const weekDays = getWeekDays()

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    const days = getWeekDays()
    const from = days[0].toISOString()
    const to   = new Date(days[6])
    to.setHours(23, 59, 59, 999)

    const [weekRes, draftsRes] = await Promise.all([
      fetch(`/api/social/posts?business_id=${businessId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to.toISOString())}`),
      fetch(`/api/social/posts?business_id=${businessId}&status=draft`),
    ])

    const weekData   = await weekRes.json().catch(() => ({ posts: [] }))
    const draftsData = await draftsRes.json().catch(() => ({ posts: [] }))

    const all    = [...(weekData.posts ?? []), ...(draftsData.posts ?? [])]
    const seen   = new Set<string>()
    const unique = all.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
    setPosts(unique)
    setLoading(false)
  }, [businessId, weekOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const getPostsForDay = (day: Date) =>
    posts.filter(p => {
      if (!p.scheduled_for) return false
      return new Date(p.scheduled_for).toDateString() === day.toDateString()
    })

  const unscheduledDrafts = posts.filter(p => !p.scheduled_for && p.status === 'draft')
  const pendingCount      = posts.filter(p => p.approval_status === 'pending' && p.status !== 'published').length

  const handleGenerate = async () => {
    setGenerating(true)
    const res = await fetch('/api/aria/social-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId }),
    })
    if (res.ok) await fetchPosts()
    setGenerating(false)
  }

  const handleOwnerRequest = async () => {
    if (!requestText.trim()) return
    setSubmittingReq(true)
    const res = await fetch('/api/social/owner-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id:    businessId,
        request_text:   requestText,
        schedule_kind:  scheduleKind,
        specific_date:  specificDate  || null,
        recurrence_rule: recurrence   || null,
      }),
    })
    if (res.ok) {
      setRequestText('')
      setSpecificDate('')
      setRecurrence('')
      await fetchPosts()
    }
    setSubmittingReq(false)
  }

  const handleApprove = async (postId: string) => {
    await fetch('/api/social/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: postId, approval_status: 'approved' }),
    })
    await fetchPosts()
  }

  const handleBulkApprove = async () => {
    const pending = posts.filter(p => p.approval_status === 'pending')
    await fetch('/api/social/posts/bulk-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, post_ids: pending.map(p => p.id) }),
    })
    await fetchPosts()
  }

  const handlePublishNow = async (postId: string) => {
    setPublishing(postId)
    await fetch(`/api/social/posts/${postId}/publish`, { method: 'POST' })
    await fetchPosts()
    setPublishing(null)
  }

  const handleReschedule = async (postId: string, newTime: string) => {
    await fetch('/api/social/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: postId, scheduled_for: newTime }),
    })
    await fetchPosts()
  }

  const handleDelete = async (postId: string) => {
    if (!confirm('Delete this post?')) return
    await fetch(`/api/social/posts?id=${postId}`, { method: 'DELETE' })
    await fetchPosts()
  }

  const handleSaveEdit = async (postId: string) => {
    await fetch('/api/social/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: postId, caption: editCaption }),
    })
    setEditingPost(null)
    await fetchPosts()
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7, padding: '7px 10px',
    color: '#fff', fontSize: 12,
    outline: 'none',
  }

  const ghostBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
    fontSize: 12, fontWeight: 500, border: 'none',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'inherit',
    ...extra,
  })

  const primaryBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
    ...ghostBtn(),
    background: '#7FB897',
    color: '#fff',
    ...extra,
  })

  return (
    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Top bar ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0, flex: 1 }}>
          Content Calendar
        </h3>
        {pendingCount > 0 && (
          <button style={primaryBtn()} onClick={handleBulkApprove}>
            ✓ Approve all ({pendingCount})
          </button>
        )}
        <button style={ghostBtn()} onClick={handleGenerate} disabled={generating}>
          {generating ? '✨ Generating...' : '✨ Generate week'}
        </button>
      </div>

      {/* ── Owner request box ──────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '0 0 10px' }}>
          📝 Tell Aria what to post
        </p>
        <textarea
          value={requestText}
          onChange={e => setRequestText(e.target.value)}
          placeholder={'e.g. "Promote our happy hour this Friday at 5pm"\ne.g. "Announce closed Dec 24-26 for renovation"'}
          rows={2}
          style={{
            ...inputStyle, width: '100%', resize: 'none',
            boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13,
          }}
        />

        <div style={{ display: 'flex', gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
          {(['asap', 'specific_date', 'recurring'] as const).map(k => (
            <button key={k} onClick={() => setScheduleKind(k)}
              style={scheduleKind === k ? primaryBtn({ fontSize: 11 }) : ghostBtn({ fontSize: 11 })}>
              {k === 'asap' ? '⚡ ASAP' : k === 'specific_date' ? '📅 Specific date' : '🔁 Recurring'}
            </button>
          ))}
        </div>

        {scheduleKind === 'specific_date' && (
          <input type="datetime-local" value={specificDate}
            onChange={e => setSpecificDate(e.target.value)}
            style={{ ...inputStyle, marginBottom: 8 }} />
        )}

        {scheduleKind === 'recurring' && (
          <input placeholder="e.g. Every Friday at 5pm, Monthly first Monday"
            value={recurrence} onChange={e => setRecurrence(e.target.value)}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
        )}

        <button style={primaryBtn({ marginTop: 4 })}
          onClick={handleOwnerRequest}
          disabled={submittingReq || !requestText.trim()}>
          {submittingReq ? 'Generating...' : 'Ask Aria to create this post →'}
        </button>
      </div>

      {/* ── Week navigation ────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={ghostBtn()} onClick={() => setWeekOffset(w => w - 1)}>← Prev</button>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, flex: 1, textAlign: 'center' }}>
          {formatSlotDay(weekDays[0])} — {formatSlotDay(weekDays[6])}
        </span>
        <button style={ghostBtn()} onClick={() => setWeekOffset(w => w + 1)}>Next →</button>
      </div>

      {/* ── Week grid ──────────────────────────────────────── */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: 24 }}>
          Loading posts...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {weekDays.map(day => {
            const dayPosts = getPostsForDay(day)
            const isToday  = day.toDateString() === new Date().toDateString()
            const isPast   = day < new Date() && !isToday

            return (
              <div key={day.toISOString()} style={{
                background: 'rgba(255,255,255,0.03)',
                border: isToday ? '1px solid rgba(127,184,151,0.4)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, padding: 12, opacity: isPast ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: dayPosts.length > 0 ? 10 : 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isToday ? '#7FB897' : 'rgba(255,255,255,0.5)', minWidth: 100 }}>
                    {isToday ? '📍 Today' : formatSlotDay(day)}
                  </span>
                  {dayPosts.length === 0 && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>No posts scheduled</span>
                  )}
                </div>
                {dayPosts.map(post => (
                  <PostCard key={post.id} post={post}
                    editing={editingPost === post.id} editCaption={editCaption}
                    publishing={publishing === post.id}
                    onEdit={() => { setEditingPost(post.id); setEditCaption(post.caption) }}
                    onSaveEdit={() => handleSaveEdit(post.id)}
                    onCancelEdit={() => setEditingPost(null)}
                    onEditCaptionChange={setEditCaption}
                    onApprove={() => handleApprove(post.id)}
                    onPublishNow={() => handlePublishNow(post.id)}
                    onReschedule={t => handleReschedule(post.id, t)}
                    onDelete={() => handleDelete(post.id)} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Unscheduled drafts ─────────────────────────────── */}
      {unscheduledDrafts.length > 0 && (
        <div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '0 0 8px', fontWeight: 500 }}>
            DRAFTS — not yet scheduled
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unscheduledDrafts.map(post => (
              <PostCard key={post.id} post={post}
                editing={editingPost === post.id} editCaption={editCaption}
                publishing={publishing === post.id}
                onEdit={() => { setEditingPost(post.id); setEditCaption(post.caption) }}
                onSaveEdit={() => handleSaveEdit(post.id)}
                onCancelEdit={() => setEditingPost(null)}
                onEditCaptionChange={setEditCaption}
                onApprove={() => handleApprove(post.id)}
                onPublishNow={() => handlePublishNow(post.id)}
                onReschedule={t => handleReschedule(post.id, t)}
                onDelete={() => handleDelete(post.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Individual post card ──────────────────────────────────────────────────────

function PostCard({
  post, editing, editCaption, publishing,
  onEdit, onSaveEdit, onCancelEdit, onEditCaptionChange,
  onApprove, onPublishNow, onReschedule, onDelete,
}: {
  post: SocialPost
  editing: boolean
  editCaption: string
  publishing: boolean
  onEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditCaptionChange: (v: string) => void
  onApprove: () => void
  onPublishNow: () => void
  onReschedule: (t: string) => void
  onDelete: () => void
}) {
  const [showReschedule, setShowReschedule] = useState(false)
  const [newTime, setNewTime] = useState(
    post.scheduled_for ? new Date(post.scheduled_for).toISOString().slice(0, 16) : ''
  )

  const statusBadge   = STATUS_BADGES[post.status] ?? STATUS_BADGES.draft
  const platformColor = PLATFORM_COLORS[post.platform] ?? '#7FB897'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderLeft: `3px solid ${platformColor}`,
      borderRadius: 8, padding: '10px 12px',
      display: 'flex', gap: 10, marginBottom: 6,
    }}>
      {/* Image thumbnail */}
      {post.image_urls?.[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_urls[0]} alt=""
          style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Platform + status + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: platformColor }}>
            {PLATFORM_ICONS[post.platform]} {post.platform.replace('_', ' ')}
          </span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: statusBadge.bg, color: statusBadge.color }}>
            {statusBadge.label}
          </span>
          {post.approval_status === 'pending' && post.status !== 'published' && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
              Needs approval
            </span>
          )}
          {post.scheduled_for && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
              {formatSlotTime(new Date(post.scheduled_for))}
            </span>
          )}
          {post.ai_generated && (
            <span style={{ fontSize: 10, color: 'rgba(127,184,151,0.6)' }}>✨ AI</span>
          )}
        </div>

        {/* Caption */}
        {editing ? (
          <div>
            <textarea value={editCaption} onChange={e => onEditCaptionChange(e.target.value)} rows={3}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(127,184,151,0.3)', borderRadius: 6, padding: '6px 8px', color: '#fff', fontSize: 12, resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button onClick={onSaveEdit}   style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: '#7FB897', border: 'none', color: '#fff', fontSize: 11, fontFamily: 'inherit' }}>Save</button>
              <button onClick={onCancelEdit} style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {post.caption}
          </p>
        )}

        {/* Hashtags */}
        {post.hashtags?.length > 0 && !editing && (
          <p style={{ fontSize: 10, color: '#7FB897', margin: '3px 0 0', opacity: 0.7 }}>
            {post.hashtags.slice(0, 4).join(' ')}
          </p>
        )}

        {/* Publish error */}
        {post.publish_error && (
          <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>
            ⚠️ {post.publish_error.slice(0, 80)}
          </p>
        )}

        {/* Published link */}
        {post.platform_url && (
          <a href={post.platform_url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#7FB897', marginTop: 3, display: 'block' }}>
            View post ↗
          </a>
        )}

        {/* Actions */}
        {post.status !== 'published' && (
          <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
            {post.approval_status === 'pending' && (
              <button onClick={onApprove}
                style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.3)', color: '#7FB897', fontSize: 11, fontFamily: 'inherit' }}>
                ✓ Approve
              </button>
            )}
            {post.approval_status === 'approved' && (
              <button onClick={onPublishNow} disabled={publishing}
                style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: '#7FB897', border: 'none', color: '#fff', fontSize: 11, fontFamily: 'inherit', opacity: publishing ? 0.7 : 1 }}>
                {publishing ? 'Publishing...' : '🚀 Publish now'}
              </button>
            )}
            <button onClick={onEdit}
              style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'inherit' }}>
              ✏️ Edit
            </button>
            <button onClick={() => setShowReschedule(s => !s)}
              style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'inherit' }}>
              📅 Reschedule
            </button>
            <button onClick={onDelete}
              style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: 'none', color: '#ef4444', fontSize: 11, marginLeft: 'auto', fontFamily: 'inherit' }}>
              🗑
            </button>
          </div>
        )}

        {/* Reschedule picker */}
        {showReschedule && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <input type="datetime-local" value={newTime} onChange={e => setNewTime(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 11, outline: 'none' }} />
            <button onClick={() => { onReschedule(newTime); setShowReschedule(false) }}
              style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', background: '#7FB897', border: 'none', color: '#fff', fontSize: 11, fontFamily: 'inherit' }}>
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Default export so existing `import ContentCalendar from '...'` still works
export default ContentCalendar