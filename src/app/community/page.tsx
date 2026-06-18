'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Search, Compass, Store } from 'lucide-react'
import { PALETTE, BORDER, RADIUS, MAX_W } from './theme'
import { PostCard, AiInsightCard, type PostCardData } from './PostCard'
import { StoriesRow, type StoryBubble } from './StoriesRow'
import { supabase } from '@/lib/supabase'

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
  const [viewMode, setViewMode] = useState<'discover' | 'owners'>('discover')
  const [feedTab, setFeedTab] = useState<'foryou' | 'following'>('foryou')
  const [member, setMember] = useState<{ id: string; nickname: string | null } | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [ownerBusiness, setOwnerBusiness] = useState<{ id: string; name: string } | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (tab: 'foryou' | 'following' = 'foryou') => {
    setLoading(true)
    try {
      const feedUrl = '/api/community/feed' + (tab === 'following' ? '?following_only=true' : '')
      const [fRes, sRes] = await Promise.all([
        fetch(feedUrl).then(r => r.json()),
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

  // Detect if the current auth user is a business owner (For Owners mode toggle)
  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (data) setOwnerBusiness(data as { id: string; name: string })
    })()
  }, [])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      // Keep the active tab while paginating (tab state persists across scroll).
      const url = '/api/community/feed?before=' + encodeURIComponent(cursor) + (feedTab === 'following' ? '&following_only=true' : '')
      const r = await fetch(url).then(r => r.json()) as FeedResponse
      setPosts(prev => [...prev, ...(r.posts ?? [])])
      setCursor(r.next_cursor)
    } catch (e) {
      console.error(e)
    }
    setLoadingMore(false)
  }, [cursor, loadingMore, feedTab])

  function selectFeedTab(t: 'foryou' | 'following') {
    if (t === feedTab) return
    setFeedTab(t)
    setPosts([])
    setCursor(null)
    load(t)
  }

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
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: ownerBusiness ? 12 : 16, gap: 8 }}>
        {/* "a. aria" wordmark — lime squircle + lowercase wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 11,
            background: PALETTE.accent, border: BORDER,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 800, color: PALETTE.ink, letterSpacing: '-0.04em',
          }}>a.</span>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: PALETTE.ink }}>aria</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <Link href="/community/discover" prefetch={false} aria-label="Discover" style={roundBtn}>
            <Compass size={18} color={PALETTE.ink} />
          </Link>
          <Link href="/community/search" prefetch={false} aria-label="Search" style={roundBtn}>
            <Search size={18} color={PALETTE.ink} />
          </Link>
          {!member && (
            <Link href="/community/me" style={{
              padding: '9px 16px', borderRadius: RADIUS.pill,
              background: PALETTE.accent, color: PALETTE.ink, border: BORDER,
              fontSize: 12, fontWeight: 700, textDecoration: 'none', minHeight: 40,
              display: 'inline-flex', alignItems: 'center',
            }}>join</Link>
          )}
        </div>
      </header>

      {/* Discover / For Owners mode toggle — only shown to business owners */}
      {ownerBusiness && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, padding: '4px', background: PALETTE.surfaceAlt, borderRadius: RADIUS.lg, border: BORDER }}>
          {(['discover', 'owners'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              flex: 1, padding: '9px 0', border: 'none', borderRadius: RADIUS.pill,
              background: viewMode === m ? PALETTE.accent : 'transparent',
              color: PALETTE.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'background 160ms',
            }}>
              {m === 'discover' ? 'Discover' : 'For Owners'}
            </button>
          ))}
        </div>
      )}

      {/* For Owners panel */}
      {viewMode === 'owners' && ownerBusiness && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.xl, padding: 20, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: RADIUS.pill, background: PALETTE.accent, border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Store size={18} color={PALETTE.ink} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: PALETTE.ink }}>{ownerBusiness.name}</p>
                <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: '2px 0 0' }}>Your community presence</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link href="/dashboard/community" prefetch={false} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: PALETTE.surfaceAlt, border: BORDER,
                borderRadius: RADIUS.md, textDecoration: 'none', color: PALETTE.ink,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Manage posts</span>
                <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>→</span>
              </Link>
              <Link href="/dashboard/community/marketer" prefetch={false} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: PALETTE.surfaceAlt, border: BORDER,
                borderRadius: RADIUS.md, textDecoration: 'none', color: PALETTE.ink,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>AI content assistant</span>
                <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>→</span>
              </Link>
              <Link href="/dashboard/community/profile" prefetch={false} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: PALETTE.surfaceAlt, border: BORDER,
                borderRadius: RADIUS.md, textDecoration: 'none', color: PALETTE.ink,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Community profile</span>
                <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>→</span>
              </Link>
            </div>
          </div>
          <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
            Tap Discover to browse the community feed as a patron.
          </p>
        </div>
      )}

      {/* CX-POLISH-2 — For You / Following tab toggle (customer-facing, separate from owner viewMode) */}
      {viewMode === 'discover' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, padding: '4px', background: PALETTE.surfaceAlt, borderRadius: RADIUS.lg, border: BORDER }}>
          {([['foryou', 'For You'], ['following', 'Following']] as const).map(([t, label]) => (
            <button key={t} onClick={() => selectFeedTab(t)} style={{
              flex: 1, padding: '9px 0', border: 'none', borderRadius: RADIUS.pill,
              background: feedTab === t ? PALETTE.accent : 'transparent',
              color: PALETTE.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'background 160ms',
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* Stories row — only in Discover mode */}
      {viewMode === 'discover' && <StoriesRow bubbles={bubbles} loading={loading && bubbles.length === 0} />}

      {/* Posts — Discover mode only */}
      {viewMode === 'discover' && (
        loading && posts.length === 0 ? (
          <FeedSkeleton />
        ) : posts.length === 0 ? (
          feedTab === 'following' ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: PALETTE.surface, borderRadius: RADIUS.xl, border: BORDER, marginTop: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: PALETTE.ink }}>Follow some businesses to see their posts here.</p>
              <Link href="/community/discover" prefetch={false} style={{ display: 'inline-block', marginTop: 14, padding: '10px 18px', borderRadius: RADIUS.pill, background: PALETTE.accent, color: PALETTE.ink, border: BORDER, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Discover local shops</Link>
            </div>
          ) : (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: PALETTE.surface, borderRadius: RADIUS.xl, border: BORDER, marginTop: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: PALETTE.ink }}>{mode === 'followed' ? 'no posts yet from your follows.' : 'no posts yet — check back soon.'}</p>
              {mode === 'discovery' && (
                <p style={{ fontSize: 13, fontWeight: 500, color: PALETTE.ink, opacity: 0.6, margin: '8px 0 0', lineHeight: 1.5 }}>Visit a shop&apos;s page to follow them and start your personalised feed.</p>
              )}
            </div>
          )
        ) : (
          <div style={{ marginTop: 16 }}>
            {posts.map(p => (
              p.ai_card
                ? <AiInsightCard key={p.id} post={p} />
                : <PostCard key={p.id} post={p} detailHref={'/community/posts/' + p.id} onHideBusiness={mode === 'followed' ? hideBusiness : undefined} showHide={mode === 'followed'} />
            ))}
            {cursor && (
              <div ref={sentinelRef} style={{ textAlign: 'center', padding: 20 }}>
                <span style={{ ...metaCaps }}>{loadingMore ? 'loading…' : 'scroll for more'}</span>
              </div>
            )}
          </div>
        )
      )}
    </main>
  )
}

const roundBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: '50%',
  background: PALETTE.surface, border: BORDER,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  textDecoration: 'none',
}
const metaCaps: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALETTE.inkSoft,
}

function FeedSkeleton() {
  return (
    <div style={{ marginTop: 16 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: PALETTE.surface, borderRadius: RADIUS.xl, border: BORDER, marginBottom: 14, padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: PALETTE.surfaceAlt }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 11, width: '40%', background: PALETTE.surfaceAlt, borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 9, width: '25%', background: PALETTE.surfaceAlt, borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ height: 148, background: PALETTE.surfaceAlt, borderRadius: RADIUS.md, marginBottom: 10 }} />
          <div style={{ height: 14, width: '80%', background: PALETTE.surfaceAlt, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
