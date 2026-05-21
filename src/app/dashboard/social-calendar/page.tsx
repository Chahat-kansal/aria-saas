'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface ScheduledPost {
  id: string
  platform: string
  content: string
  scheduled_at: string
  status: string
  image_url?: string | null
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2',
  tiktok: '#010101', linkedin: '#0A66C2', google: '#4285F4',
}
const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'IG', facebook: 'FB', twitter: 'X', tiktok: 'TT', linkedin: 'LI', google: 'G',
}
const STATUS_COLORS: Record<string, string> = {
  scheduled: '#F59E0B', published: '#22C55E', draft: '#6B7280', failed: '#EF4444',
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export default function SocialCalendarPage() {
  const { business } = useBusinessContext()
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostPlatform, setNewPostPlatform] = useState('instagram')
  const [newPostDate, setNewPostDate] = useState('')
  const [showScheduler, setShowScheduler] = useState(false)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = new Date()

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const res = await fetch('/api/social/posts?business_id=' + business.id + '&limit=100')
      const d = await res.json()
      setPosts(d.posts ?? d.data ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }

  function postsForDay(day: number): ScheduledPost[] {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0')
    return posts.filter(p => p.scheduled_at?.startsWith(dateStr))
  }

  async function generateContent() {
    if (!business?.id) return
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, platform: newPostPlatform, type: 'promotional' }),
      })
      const d = await res.json()
      if (d.content) setNewPostContent(d.content)
    } catch { /* ignore */ }
    setGenerating(false)
  }

  async function schedulePost() {
    if (!business?.id || !newPostContent.trim() || !newPostDate) return
    try {
      await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          platform: newPostPlatform,
          content: newPostContent,
          scheduled_at: new Date(newPostDate).toISOString(),
          status: 'scheduled',
        }),
      })
      setNewPostContent('')
      setNewPostDate('')
      setShowScheduler(false)
      load()
    } catch { /* ignore */ }
  }

  const selectedDayPosts = selectedDay ? postsForDay(selectedDay) : []

  const C = {
    bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
    muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
    border: 'rgba(255,255,255,0.07)', violet: '#8B5CF6', green: '#22C55E',
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Post Calendar</h1>
          <p style={{ fontSize: 13, color: C.muted }}>{posts.length} posts scheduled · {posts.filter(p => p.status === 'published').length} published this month</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['calendar', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid ' + (view === v ? C.violet : C.border), background: view === v ? 'rgba(139,92,246,0.12)' : 'transparent', color: view === v ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {v}
            </button>
          ))}
          <button onClick={() => setShowScheduler(!showScheduler)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Schedule Post
          </button>
        </div>
      </div>

      {showScheduler && (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '20px', marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Schedule New Post</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 200px', gap: 10, marginBottom: 10 }}>
            <select value={newPostPlatform} onChange={e => setNewPostPlatform(e.target.value)}
              style={{ padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit' }}>
              {Object.keys(PLATFORM_COLORS).map(p => (
                <option key={p} value={p} style={{ background: '#1a1a2e' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
            <input type="datetime-local" value={newPostDate} onChange={e => setNewPostDate(e.target.value)}
              style={{ padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit' }} />
            <button onClick={generateContent} disabled={generating}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)', color: C.violet, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: generating ? 0.6 : 1 }}>
              {generating ? '✨ Writing...' : '✨ AI Generate'}
            </button>
          </div>
          <textarea value={newPostContent} onChange={e => setNewPostContent(e.target.value)} rows={4}
            placeholder="Write your post content or use AI Generate..."
            style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={schedulePost} disabled={!newPostContent.trim() || !newPostDate}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: newPostContent.trim() && newPostDate ? C.green : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Schedule Post
            </button>
            <button onClick={() => setShowScheduler(false)}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {view === 'calendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedDay ? '1fr 320px' : '1fr', gap: 20 }}>
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, overflow: 'hidden' }}>
            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid ' + C.border }}>
              <button onClick={prevMonth}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                ‹
              </button>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{MONTHS[month]} {year}</h2>
              <button onClick={nextMonth}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                ›
              </button>
            </div>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid ' + C.border }}>
              {DAYS_SHORT.map(d => (
                <div key={d} style={{ padding: '8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
              ))}
            </div>
            {/* Calendar grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={'empty-' + i} style={{ minHeight: 80, borderRight: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.01)' }} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dayPosts = postsForDay(day)
                const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
                const isSelected = selectedDay === day
                return (
                  <div key={day} onClick={() => setSelectedDay(isSelected ? null : day)}
                    style={{ minHeight: 80, borderRight: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border, padding: '6px 8px', cursor: 'pointer', background: isSelected ? 'rgba(139,92,246,0.08)' : isToday ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'background 0.1s' }}>
                    <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? C.violet : C.text, marginBottom: 4, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: isToday ? 'rgba(139,92,246,0.2)' : 'transparent' }}>
                      {day}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {dayPosts.slice(0, 3).map(p => (
                        <div key={p.id} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: PLATFORM_COLORS[p.platform] + '30', color: PLATFORM_COLORS[p.platform], fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {PLATFORM_ICONS[p.platform]} {p.content.slice(0, 15)}...
                        </div>
                      ))}
                      {dayPosts.length > 3 && (
                        <div style={{ fontSize: 9, color: C.dim }}>+{dayPosts.length - 3} more</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {selectedDay && (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '18px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                {MONTHS[month]} {selectedDay}
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 400, marginLeft: 8 }}>{selectedDayPosts.length} posts</span>
              </p>
              {selectedDayPosts.length === 0 ? (
                <div style={{ color: C.muted, textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
                  No posts scheduled
                  <button onClick={() => { setNewPostDate(year + '-' + String(month + 1).padStart(2,'0') + '-' + String(selectedDay).padStart(2,'0') + 'T09:00'); setShowScheduler(true) }}
                    style={{ display: 'block', margin: '12px auto 0', padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: C.violet, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Add post
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedDayPosts.map(p => (
                    <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid ' + C.border, borderLeft: '3px solid ' + (PLATFORM_COLORS[p.platform] ?? C.violet), borderRadius: '0 10px 10px 0', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: PLATFORM_COLORS[p.platform] + '20', color: PLATFORM_COLORS[p.platform] }}>
                          {PLATFORM_ICONS[p.platform]} {p.platform}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 99, background: STATUS_COLORS[p.status] + '20', color: STATUS_COLORS[p.status] }}>
                          {p.status}
                        </span>
                        <span style={{ fontSize: 10, color: C.dim, marginLeft: 'auto' }}>
                          {new Date(p.scheduled_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{p.content.slice(0, 140)}{p.content.length > 140 ? '...' : ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>Loading...</div>
          ) : posts.length === 0 ? (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '40px', textAlign: 'center' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>📅</p>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No posts scheduled</p>
              <p style={{ fontSize: 13, color: C.muted }}>Use Schedule Post to plan your social content.</p>
            </div>
          ) : posts.sort((a,b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()).map(p => (
            <div key={p.id} style={{ background: C.card, border: '1px solid ' + C.border, borderLeft: '4px solid ' + (PLATFORM_COLORS[p.platform] ?? C.violet), borderRadius: '0 12px 12px 0', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: PLATFORM_COLORS[p.platform] + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: PLATFORM_COLORS[p.platform] }}>
                {PLATFORM_ICONS[p.platform]}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>{p.content.slice(0, 200)}{p.content.length > 200 ? '...' : ''}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: C.dim }}>
                    {new Date(p.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(p.scheduled_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: STATUS_COLORS[p.status] + '20', color: STATUS_COLORS[p.status] }}>
                    {p.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
