'use client'
import { useState, useEffect } from 'react'

interface Post {
  id: string
  platform: string
  caption: string
  hashtags: string[]
  status: string
  approval_status: string
  scheduled_for: string | null
  published_at: string | null
  image_urls: string[] | null
  owner_request: string | null
}

interface Props {
  businessId: string
  onPostsChanged?: () => void
}

const PLATFORM_COLOR: Record<string, string> = {
  instagram: '#E1306C',
  facebook:  '#1877F2',
  google_business: '#4285F4',
}
const STATUS_COLOR: Record<string, string> = {
  draft:      'rgba(139,92,246,0.15)',
  scheduled:  'rgba(59,130,246,0.15)',
  approved:   'rgba(34,197,94,0.15)',
  published:  'rgba(34,197,94,0.25)',
  failed:     'rgba(239,68,68,0.15)',
  publishing: 'rgba(245,158,11,0.15)',
}
const STATUS_TEXT: Record<string, string> = {
  draft:      '#8B5CF6',
  scheduled:  '#3B82F6',
  approved:   '#22C55E',
  published:  '#22C55E',
  failed:     '#EF4444',
  publishing: '#F59E0B',
}

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor)
  start.setDate(start.getDate() - start.getDay() + 1) // Monday
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

export default function ContentCalendar({ businessId, onPostsChanged }: Props) {
  const [weekAnchor, setWeekAnchor]       = useState(new Date())
  const [posts, setPosts]                 = useState<Post[]>([])
  const [loading, setLoading]             = useState(true)
  const [requestText, setRequestText]     = useState('')
  const [scheduleKind, setScheduleKind]   = useState<'asap' | 'specific_date' | 'recurring'>('asap')
  const [specificDate, setSpecificDate]   = useState('')
  const [recurrenceRule, setRecurrenceRule] = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [submitResult, setSubmitResult]   = useState<string | null>(null)
  const [approvingAll, setApprovingAll]   = useState(false)
  const [publishing, setPublishing]       = useState<Record<string, boolean>>({})

  const days = getWeekDays(weekAnchor)

  useEffect(() => {
    loadPosts()
  }, [businessId, weekAnchor]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPosts() {
    setLoading(true)
    try {
      const start = days[0].toISOString()
      const end   = new Date(days[6])
      end.setHours(23, 59, 59, 999)
      const res = await fetch(
        `/api/social/posts?business_id=${businessId}&from=${encodeURIComponent(start)}&to=${encodeURIComponent(end.toISOString())}`
      )
      const d = await res.json()
      // Also include drafts with no schedule (show in "unscheduled" section)
      const draftRes = await fetch(`/api/social/posts?business_id=${businessId}&status=draft`)
      const draftD = await draftRes.json()
      const all = [...(d.posts ?? []), ...(draftD.posts ?? [])]
      // Deduplicate by id
      const seen = new Set<string>()
      setPosts(all.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true }))
    } catch {
      setPosts([])
    }
    setLoading(false)
  }

  async function handlePublish(postId: string) {
    setPublishing(p => ({ ...p, [postId]: true }))
    try {
      await fetch(`/api/social/posts/${postId}/publish`, { method: 'POST' })
      await loadPosts()
      onPostsChanged?.()
    } finally {
      setPublishing(p => ({ ...p, [postId]: false }))
    }
  }

  async function handleApprove(postId: string) {
    await fetch('/api/social/posts/bulk-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_ids: [postId] }),
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, approval_status: 'approved', status: p.scheduled_for ? 'scheduled' : 'approved' } : p))
    onPostsChanged?.()
  }

  async function handleApproveAll() {
    const pending = posts.filter(p => p.approval_status === 'pending')
    if (pending.length === 0) return
    setApprovingAll(true)
    await fetch('/api/social/posts/bulk-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_ids: pending.map(p => p.id) }),
    })
    await loadPosts()
    onPostsChanged?.()
    setApprovingAll(false)
  }

  async function handleOwnerRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!requestText.trim()) return
    setSubmitting(true)
    setSubmitResult(null)
    try {
      const res = await fetch('/api/social/owner-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          request_text: requestText,
          schedule_kind: scheduleKind,
          specific_date: scheduleKind === 'specific_date' ? specificDate : undefined,
          recurrence_rule: scheduleKind === 'recurring' ? recurrenceRule : undefined,
        }),
      })
      const d = await res.json()
      if (d.ok) {
        setSubmitResult(`✓ ${d.count} post${d.count !== 1 ? 's' : ''} generated — review below`)
        setRequestText('')
        setSpecificDate('')
        setRecurrenceRule('')
        await loadPosts()
        onPostsChanged?.()
      } else {
        setSubmitResult(`✗ ${d.error ?? 'Failed'}`)
      }
    } catch {
      setSubmitResult('✗ Network error')
    }
    setSubmitting(false)
  }

  const pendingCount = posts.filter(p => p.approval_status === 'pending').length

  const C = {
    card: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.07)',
    text: '#EDE8FF',
    muted: 'rgba(255,255,255,0.5)',
    dim: 'rgba(255,255,255,0.3)',
    violet: '#8B5CF6',
    sage: '#7FB897',
  }

  return (
    <div style={{ marginBottom: 32 }}>

      {/* ── Custom Request Box ─────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>
          Tell Aria what to post
        </h3>
        <p style={{ color: C.muted, fontSize: 12, margin: '0 0 14px' }}>
          Aria will write the caption, find an image, and save it for your approval.
        </p>

        <form onSubmit={handleOwnerRequest}>
          <textarea
            value={requestText}
            onChange={e => setRequestText(e.target.value)}
            placeholder={'e.g. "Promote our happy hour this Friday at 5pm"\ne.g. "Announce we\'re closed Dec 24-26 for renovation"\ne.g. "Weekly $5 latte special every Tuesday at 7am"'}
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'vertical',
              background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
              color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Schedule</label>
              <select
                value={scheduleKind}
                onChange={e => setScheduleKind(e.target.value as 'asap' | 'specific_date' | 'recurring')}
                style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: 'inherit' }}
              >
                <option value="asap">ASAP (save as draft)</option>
                <option value="specific_date">Specific date &amp; time</option>
                <option value="recurring">Recurring</option>
              </select>
            </div>

            {scheduleKind === 'specific_date' && (
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Date &amp; time</label>
                <input
                  type="datetime-local"
                  value={specificDate}
                  onChange={e => setSpecificDate(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: 'inherit' }}
                />
              </div>
            )}

            {scheduleKind === 'recurring' && (
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Recurrence</label>
                <input
                  type="text"
                  value={recurrenceRule}
                  onChange={e => setRecurrenceRule(e.target.value)}
                  placeholder={'e.g. "Every Friday at 5pm" or "Monthly first Tuesday"'}
                  style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: 'inherit', width: '100%' }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !requestText.trim()}
              style={{
                padding: '8px 18px', borderRadius: 9, border: 'none',
                background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: submitting || !requestText.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting || !requestText.trim() ? 0.6 : 1,
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              {submitting ? '✨ Generating…' : '✨ Generate post'}
            </button>
          </div>
        </form>

        {submitResult && (
          <p style={{ marginTop: 10, fontSize: 12, color: submitResult.startsWith('✓') ? C.sage : '#EF4444' }}>
            {submitResult}
          </p>
        )}
      </div>

      {/* ── Calendar Header ────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ color: C.text, fontSize: 15, fontWeight: 700, margin: 0 }}>Content Calendar</h3>
          <span style={{ fontSize: 12, color: C.muted }}>
            {days[0].toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })} –{' '}
            {days[6].toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pendingCount > 0 && (
            <button
              onClick={handleApproveAll}
              disabled={approvingAll}
              style={{
                padding: '6px 14px', borderRadius: 8, border: `1px solid rgba(34,197,94,0.3)`,
                background: 'rgba(34,197,94,0.08)', color: '#22C55E', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {approvingAll ? 'Approving…' : `✓ Approve all (${pendingCount})`}
            </button>
          )}
          <button onClick={() => setWeekAnchor(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            ← Prev
          </button>
          <button onClick={() => setWeekAnchor(new Date())}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Today
          </button>
          <button onClick={() => setWeekAnchor(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Next →
          </button>
        </div>
      </div>

      {/* ── Week Grid ──────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {days.map((_, i) => (
            <div key={i} style={{ height: 120, borderRadius: 12, background: C.card, animation: 'pulse 2s infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {days.map(day => {
            const dayPosts = posts.filter(p =>
              p.scheduled_for && isSameDay(new Date(p.scheduled_for), day)
            )
            const isToday = isSameDay(day, new Date())

            return (
              <div key={day.toISOString()} style={{
                background: isToday ? 'rgba(139,92,246,0.07)' : C.card,
                border: `1px solid ${isToday ? 'rgba(139,92,246,0.25)' : C.border}`,
                borderRadius: 12, padding: 10, minHeight: 100,
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: isToday ? C.violet : C.muted, margin: '0 0 8px' }}>
                  {day.toLocaleDateString('en-AU', { weekday: 'short' })}{' '}
                  <span style={{ fontWeight: 400 }}>{day.getDate()}</span>
                </p>

                {dayPosts.length === 0 ? (
                  <p style={{ fontSize: 10, color: C.dim, margin: 0 }}>No posts</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dayPosts.map(p => (
                      <PostMini
                        key={p.id}
                        post={p}
                        onApprove={() => handleApprove(p.id)}
                        onPublish={() => handlePublish(p.id)}
                        publishing={!!publishing[p.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Unscheduled Drafts ─────────────────────────────── */}
      {(() => {
        const unscheduled = posts.filter(p => !p.scheduled_for && p.status === 'draft')
        if (unscheduled.length === 0) return null
        return (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: C.muted, margin: '0 0 10px' }}>
              Unscheduled drafts ({unscheduled.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unscheduled.map(p => (
                <div key={p.id} style={{
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: '10px 14px',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  {p.image_urls?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_urls[0]} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${PLATFORM_COLOR[p.platform] ?? '#666'}25`, color: PLATFORM_COLOR[p.platform] ?? '#aaa', fontWeight: 700 }}>
                        {p.platform}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: STATUS_COLOR[p.status] ?? C.card, color: STATUS_TEXT[p.status] ?? C.muted, fontWeight: 600 }}>
                        {p.approval_status === 'pending' ? 'pending approval' : p.status}
                      </span>
                    </div>
                    <p style={{ color: C.text, fontSize: 12, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                      {p.caption}
                    </p>
                    {p.owner_request && (
                      <p style={{ fontSize: 10, color: C.dim, margin: '3px 0 0', fontStyle: 'italic' }}>
                        Request: "{p.owner_request.slice(0, 60)}{p.owner_request.length > 60 ? '…' : ''}"
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {p.approval_status === 'pending' && (
                      <button onClick={() => handleApprove(p.id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#22C55E', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ✓ Approve
                      </button>
                    )}
                    {p.approval_status === 'approved' && (
                      <button onClick={() => handlePublish(p.id)} disabled={!!publishing[p.id]}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)', color: '#3B82F6', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: publishing[p.id] ? 0.6 : 1 }}>
                        {publishing[p.id] ? '…' : '↑ Publish'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function PostMini({ post, onApprove, onPublish, publishing }: {
  post: Post
  onApprove: () => void
  onPublish: () => void
  publishing: boolean
}) {
  return (
    <div style={{
      background: STATUS_COLOR[post.status] ?? 'rgba(255,255,255,0.04)',
      borderRadius: 8, padding: '6px 8px',
    }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: PLATFORM_COLOR[post.platform] ?? '#aaa' }}>
          {post.platform.replace('_', ' ')}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: STATUS_TEXT[post.status] ?? '#aaa', fontWeight: 600 }}>
          {post.approval_status === 'pending' ? '⏳' : post.status === 'published' ? '✓' : post.status === 'failed' ? '✗' : '●'}
        </span>
      </div>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
        {post.caption}
      </p>
      <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
        {post.approval_status === 'pending' && (
          <button onClick={onApprove}
            style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: 'none', background: 'rgba(34,197,94,0.2)', color: '#22C55E', fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ✓ Approve
          </button>
        )}
        {post.approval_status === 'approved' && post.status !== 'published' && (
          <button onClick={onPublish} disabled={publishing}
            style={{ flex: 1, padding: '3px 0', borderRadius: 5, border: 'none', background: 'rgba(59,130,246,0.2)', color: '#3B82F6', fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: publishing ? 0.6 : 1 }}>
            {publishing ? '…' : '↑ Publish'}
          </button>
        )}
      </div>
    </div>
  )
}