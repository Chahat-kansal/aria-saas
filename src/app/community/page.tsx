'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from './theme'
import { PostCard, type PostCardData } from './PostCard'
import { StoriesRow, type StoryBubble } from './StoriesRow'

interface FeedResponse {
  posts: PostCardData[]
  next_cursor: string | null
  mode: 'followed' | 'discovery'
  member: { id: string; nickname: string | null } | null
}

export default function CommunityFeedPage() {
  const [posts, setPosts] = useState<PostCardData[]>([])
  const [bubbles, setBubbles] = useState<StoryBubble[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'followed' | 'discovery'>('discovery')
  const [member, setMember] = useState<{ id: string; nickname: string | null } | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fRes, sRes] = await Promise.all([
        fetch('/api/community/feed').then(r => r.json()),
        fetch('/api/community/stories').then(r => r.json()),
      ])
      const feed = fRes as FeedResponse
      setPosts(feed.posts ?? [])
      setCursor(feed.next_cursor ?? null)
      setMode(feed.mode ?? 'discovery')
      setMember(feed.member ?? null)
      setBubbles((sRes.bubbles ?? []) as StoryBubble[])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await fetch('/api/community/feed?before=' + encodeURIComponent(cursor)).then(r => r.json()) as FeedResponse
      setPosts(prev => [...prev, ...(r.posts ?? [])])
      setCursor(r.next_cursor)
    } catch (e) {
      console.error(e)
    }
    setLoadingMore(false)
  }, [cursor, loadingMore])

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !cursor) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore()
    }, { rootMargin: '300px' })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [cursor, loadMore])

  async function hideBusiness(business_id: string) {
    if (!member) return
    if (!confirm('Hide all posts from this business? You\'ll stay subscribed — you can unhide in Settings.')) return
    await fetch('/api/community/follows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id, is_hidden: true }),
    })
    setPosts(prev => prev.filter(p => p.business_id !== business_id))
    setBubbles(prev => prev.filter(b => b.business_id !== business_id))
  }

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Aria Community</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0', fontFamily: FONT_DISPLAY, fontStyle: 'italic', letterSpacing: '-0.01em' }}>
            {mode === 'followed' ? 'Your feed' : 'Discover local'}
          </h1>
        </div>
        {!member && (
          <Link href="/community/me" style={{
            padding: '8px 14px', borderRadius: RADIUS.pill,
            background: C.accent, color: '#0d0d14',
            fontSize: 12, fontWeight: 700, textDecoration: 'none', minHeight: 36,
            display: 'inline-flex', alignItems: 'center',
          }}>Join</Link>
        )}
      </header>

      {/* Stories row */}
      <StoriesRow bubbles={bubbles} loading={loading && bubbles.length === 0} />

      {/* Posts */}
      {loading && posts.length === 0 ? (
        <FeedSkeleton />
      ) : posts.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1px dashed ${C.border}`, marginTop: 16 }}>
          <Sparkles size={26} style={{ color: C.accent, opacity: 0.7, marginBottom: 10 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: C.text }}>{mode === 'followed' ? 'No posts yet from your follows.' : 'No posts yet — check back soon.'}</p>
          {mode === 'discovery' && (
            <p style={{ fontSize: 13, color: C.textMuted, margin: '8px 0 0', lineHeight: 1.5 }}>Visit a business page to follow them and start your personalised feed.</p>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {posts.map(p => (
            <PostCard key={p.id} post={p} onHideBusiness={mode === 'followed' ? hideBusiness : undefined} showHide={mode === 'followed'} />
          ))}
          {cursor && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: 20 }}>
              {loadingMore ? (
                <span style={{ fontSize: 12, color: C.textMuted }}>Loading…</span>
              ) : (
                <span style={{ fontSize: 12, color: C.textMuted }}>Scroll for more</span>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  )
}

function FeedSkeleton() {
  return (
    <div style={{ marginTop: 16 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: C.surface, borderRadius: RADIUS.lg, border: `1px solid ${C.border}`, marginBottom: 14, padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: RADIUS.pill, background: C.surfaceHi }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 12, width: '40%', background: C.surfaceHi, borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 10, width: '25%', background: C.surfaceHi, borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ height: 220, background: C.surfaceHi, borderRadius: RADIUS.md, marginBottom: 10 }} />
          <div style={{ height: 14, width: '80%', background: C.surfaceHi, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
