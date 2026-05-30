'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Heart, MessageCircle, Bookmark, Share2, X, Play, BadgeCheck } from 'lucide-react'
import { C, FONT } from '../theme'

interface Reel {
  id: string
  business_id: string
  business: { name: string | null; logo_url: string | null; community_verified: boolean | null } | null
  title: string | null
  body: string | null
  video_url: string | null
  thumbnail_url: string | null
  published_at: string
  counts: { like: number; comment: number; save: number }
  mine: { liked: boolean; saved: boolean }
}

export default function ReelsPage() {
  const [reels, setReels] = useState<Reel[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const d = await fetch('/api/community/reels').then(r => r.json())
        setReels(d.reels ?? [])
        setCursor(d.next_cursor ?? null)
      } catch { /* non-fatal */ }
      setLoading(false)
    })()
  }, [])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await fetch('/api/community/reels?before=' + encodeURIComponent(cursor)).then(r => r.json())
      setReels(prev => [...prev, ...(d.reels ?? [])])
      setCursor(d.next_cursor ?? null)
    } catch { /* non-fatal */ }
    setLoadingMore(false)
  }, [cursor, loadingMore])

  // Play only the visible reel, pause the others. Uses IntersectionObserver.
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = (entry.target as HTMLElement).dataset.reelId
        if (!id) return
        const video = videoRefs.current[id]
        if (!video) return
        if (entry.intersectionRatio > 0.6) {
          video.play().catch(() => null)
          // Log a view once per session per reel
          if (!video.dataset.viewed) {
            video.dataset.viewed = '1'
            fetch('/api/community/engagement', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ post_id: id, type: 'view' }),
            }).catch(() => null)
          }
        } else {
          video.pause()
        }
      })
      // Infinite scroll: if last reel is visible, load more
      const lastId = reels[reels.length - 1]?.id
      if (lastId && entries.some(e => (e.target as HTMLElement).dataset.reelId === lastId && e.intersectionRatio > 0.5)) {
        loadMore()
      }
    }, { threshold: [0, 0.6] })

    const cards = containerRef.current.querySelectorAll('[data-reel-id]')
    cards.forEach(c => obs.observe(c))
    return () => obs.disconnect()
  }, [reels, loadMore])

  async function toggle(reel: Reel, type: 'like' | 'save') {
    const wasOn = type === 'like' ? reel.mine.liked : reel.mine.saved
    setReels(prev => prev.map(r => {
      if (r.id !== reel.id) return r
      return {
        ...r,
        mine: { ...r.mine, [type === 'like' ? 'liked' : 'saved']: !wasOn },
        counts: { ...r.counts, [type]: r.counts[type] + (wasOn ? -1 : 1) },
      }
    }))
    try {
      await fetch('/api/community/engagement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: reel.id, type }),
      })
    } catch { /* swallow — already optimistically updated */ }
  }

  async function share(reel: Reel) {
    const url = window.location.origin + '/community/businesses/' + reel.business_id
    try {
      const navWithShare = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> }
      if (navWithShare.share) {
        await navWithShare.share({ title: reel.business?.name ?? 'Aria reel', text: reel.title ?? '', url })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
    } catch { /* user cancelled */ }
    fetch('/api/community/engagement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: reel.id, type: 'share' }),
    }).catch(() => null)
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontFamily: FONT }}>
        Loading reels…
      </div>
    )
  }

  if (reels.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: C.text, fontFamily: FONT, padding: 24 }}>
        <Play size={48} style={{ color: C.accent, opacity: 0.4 }} />
        <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>No reels yet</p>
        <p style={{ fontSize: 13, color: C.textMuted, margin: 0, textAlign: 'center', maxWidth: 320 }}>Local businesses share short vertical videos here. Check back soon.</p>
        <Link href="/community" style={{ marginTop: 8, padding: '10px 18px', borderRadius: 999, background: C.accent, color: C.ink, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
          Back to feed
        </Link>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{
      position: 'fixed', inset: 0, top: 0, bottom: 0,
      overflowY: 'scroll', scrollSnapType: 'y mandatory',
      background: '#000', fontFamily: FONT,
      WebkitOverflowScrolling: 'touch',
    }}>
      <Link href="/community" prefetch={false} style={{
        position: 'fixed', top: 'calc(env(safe-area-inset-top, 10px) + 10px)', left: 12, zIndex: 20,
        width: 40, height: 40, borderRadius: '50%',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', textDecoration: 'none',
      }}>
        <X size={20} />
      </Link>

      {reels.map(reel => (
        <ReelItem
          key={reel.id}
          reel={reel}
          videoRef={(el) => { videoRefs.current[reel.id] = el }}
          onLike={() => toggle(reel, 'like')}
          onSave={() => toggle(reel, 'save')}
          onShare={() => share(reel)}
        />
      ))}
    </div>
  )
}

function VideoPlayer({ videoRef, src, muted, onToggleMute, poster }: {
  videoRef: (el: HTMLVideoElement | null) => void
  src: string
  muted: boolean
  onToggleMute: () => void
  poster?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div onClick={onToggleMute} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', cursor: 'pointer', gap: 12 }}>
        {poster && <img src={poster} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: 0 }}>Video unavailable</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '4px 0 0' }}>Upload via Aria dashboard</p>
        </div>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      src={src}
      loop
      muted={muted}
      playsInline
      poster={poster}
      preload="metadata"
      onError={() => setFailed(true)}
      onClick={onToggleMute}
      style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
    />
  )
}

function ReelItem({ reel, videoRef, onLike, onSave, onShare }: {
  reel: Reel
  videoRef: (el: HTMLVideoElement | null) => void
  onLike: () => void
  onSave: () => void
  onShare: () => void
}) {
  const [muted, setMuted] = useState(true)
  return (
    <section data-reel-id={reel.id} style={{
      height: '100dvh', width: '100%', scrollSnapAlign: 'start',
      position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#000',
    }}>
      {reel.video_url ? (
        <VideoPlayer
          videoRef={videoRef}
          src={reel.video_url}
          muted={muted}
          onToggleMute={() => setMuted(m => !m)}
          poster={reel.thumbnail_url ?? undefined}
        />
      ) : null}

      {/* Right-side action stack */}
      <div style={{
        position: 'absolute', right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)',
        display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', zIndex: 5,
      }}>
        <ReelAction icon={<Heart size={28} fill={reel.mine.liked ? C.accent : 'transparent'} strokeWidth={reel.mine.liked ? 0 : 1.8} />} label={String(reel.counts.like)} onClick={onLike} active={reel.mine.liked} />
        <ReelAction icon={<MessageCircle size={28} strokeWidth={1.8} />} label={String(reel.counts.comment)} onClick={() => { /* comments shown via feed for now */ }} />
        <ReelAction icon={<Bookmark size={28} fill={reel.mine.saved ? C.accent : 'transparent'} strokeWidth={reel.mine.saved ? 0 : 1.8} />} label={String(reel.counts.save)} onClick={onSave} active={reel.mine.saved} />
        <ReelAction icon={<Share2 size={28} strokeWidth={1.8} />} label="Share" onClick={onShare} />
      </div>

      {/* Bottom caption + business */}
      <div style={{
        position: 'absolute', left: 12, right: 90, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        color: '#fff', zIndex: 5,
      }}>
        <Link href={`/community/businesses/${reel.business_id}`} prefetch={false} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', textDecoration: 'none', marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: reel.business?.logo_url ? `url(${reel.business.logo_url}) center/cover` : C.accentDeep,
            color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0,
          }}>
            {!reel.business?.logo_url && (reel.business?.name?.[0] ?? '?')}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {reel.business?.name}
            {reel.business?.community_verified && <BadgeCheck size={14} style={{ color: C.accent }} />}
          </span>
        </Link>
        {reel.title && <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px', textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>{reel.title}</p>}
        {reel.body && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.86)', margin: 0, lineHeight: 1.4, textShadow: '0 1px 8px rgba(0,0,0,0.6)', whiteSpace: 'pre-wrap' }}>{reel.body}</p>}
      </div>

      {muted && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '6px 12px', background: 'rgba(0,0,0,0.5)', borderRadius: 999, color: '#fff', fontSize: 11, pointerEvents: 'none', opacity: 0.7 }}>
          Tap for sound
        </div>
      )}
    </section>
  )
}

function ReelAction({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: 'none', cursor: 'pointer',
      color: active ? C.accent : '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      padding: 4, fontFamily: 'inherit', minWidth: 48, minHeight: 48,
    }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{label}</span>
    </button>
  )
}
