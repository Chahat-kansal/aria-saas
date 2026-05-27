'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { X, BadgeCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { C, FONT } from './theme'
import type { StoryBubble } from './StoriesRow'

const STORY_DURATION_MS = 5000

interface Props {
  bubbles: StoryBubble[]
  startIndex: number
  onClose: () => void
}

export function StoryViewer({ bubbles, startIndex, onClose }: Props) {
  const [bubbleIdx, setBubbleIdx] = useState(startIndex)
  const [storyIdx, setStoryIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const pausedAtRef = useRef<number>(0)

  const bubble = bubbles[bubbleIdx]
  const story = bubble?.stories[storyIdx]

  // Reset progress when story changes
  useEffect(() => {
    setProgress(0)
    startTimeRef.current = Date.now()
    pausedAtRef.current = 0
  }, [bubbleIdx, storyIdx])

  // Progress animation
  useEffect(() => {
    if (paused) return
    function tick() {
      const elapsed = Date.now() - startTimeRef.current - pausedAtRef.current
      const p = Math.min(1, elapsed / STORY_DURATION_MS)
      setProgress(p)
      if (p >= 1) {
        advance()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleIdx, storyIdx, paused])

  function advance() {
    if (!bubble) { onClose(); return }
    if (storyIdx < bubble.stories.length - 1) {
      setStoryIdx(s => s + 1)
    } else if (bubbleIdx < bubbles.length - 1) {
      setBubbleIdx(b => b + 1)
      setStoryIdx(0)
    } else {
      onClose()
    }
  }

  function rewind() {
    if (storyIdx > 0) setStoryIdx(s => s - 1)
    else if (bubbleIdx > 0) {
      setBubbleIdx(b => b - 1)
      setStoryIdx(0)
    } else {
      setProgress(0)
      startTimeRef.current = Date.now()
      pausedAtRef.current = 0
    }
  }

  // Log a view (best-effort, fire-and-forget)
  useEffect(() => {
    if (!story?.id) return
    fetch('/api/community/engagement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: story.id, type: 'view' }),
    }).catch(() => null)
  }, [story?.id])

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') advance()
      else if (e.key === 'ArrowLeft') rewind()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleIdx, storyIdx])

  if (!bubble || !story) return null

  const firstMedia = story.media_urls?.[0]
  const isVideo = story.media_type === 'video' || story.media_type === 'reel'

  return (
    <div
      onPointerDown={() => {
        pausedAtRef.current += Date.now() - startTimeRef.current - pausedAtRef.current - (progress * STORY_DURATION_MS)
        // simpler: just pause via flag, recompute when resumed
        setPaused(true)
      }}
      onPointerUp={() => {
        startTimeRef.current = Date.now() - (progress * STORY_DURATION_MS)
        pausedAtRef.current = 0
        setPaused(false)
      }}
      onPointerLeave={() => {
        if (paused) {
          startTimeRef.current = Date.now() - (progress * STORY_DURATION_MS)
          pausedAtRef.current = 0
          setPaused(false)
        }
      }}
      style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT,
      }}>
      {/* Progress bars */}
      <div style={{ position: 'absolute', top: 'env(safe-area-inset-top, 10px)', left: 14, right: 14, display: 'flex', gap: 4, zIndex: 10 }}>
        {bubble.stories.map((_, i) => {
          const fill = i < storyIdx ? 1 : i === storyIdx ? progress : 0
          return (
            <div key={i} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: (fill * 100) + '%', height: '100%', background: '#fff', transition: i === storyIdx ? 'none' : 'width 200ms' }} />
            </div>
          )
        })}
      </div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 10px) + 16px)', left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 10, zIndex: 10 }}>
        <Link href={`/community/businesses/${bubble.business_id}`} onClick={e => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', textDecoration: 'none', flex: 1, minWidth: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: bubble.business?.logo_url ? `url(${bubble.business.logo_url}) center/cover` : C.accentDeep,
            color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0,
          }}>
            {!bubble.business?.logo_url && (bubble.business?.name?.[0] ?? '?')}
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bubble.business?.name}
            {bubble.business?.community_verified && <BadgeCheck size={14} style={{ color: C.accent }} />}
          </span>
        </Link>
        <button onClick={e => { e.stopPropagation(); onClose() }}
          style={{ background: 'transparent', border: 'none', color: '#fff', padding: 8, cursor: 'pointer', display: 'flex', minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
          <X size={22} />
        </button>
      </div>

      {/* Tap zones */}
      <button onClick={e => { e.stopPropagation(); rewind() }}
        style={{ position: 'absolute', top: 80, bottom: 80, left: 0, width: '30%', background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 12, color: 'rgba(255,255,255,0.4)' }}
        aria-label="Previous story">
        <ChevronLeft size={28} style={{ opacity: 0 }} />
      </button>
      <button onClick={e => { e.stopPropagation(); advance() }}
        style={{ position: 'absolute', top: 80, bottom: 80, right: 0, width: '30%', background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 12, color: 'rgba(255,255,255,0.4)' }}
        aria-label="Next story">
        <ChevronRight size={28} style={{ opacity: 0 }} />
      </button>

      {/* Content */}
      <div style={{ width: '100%', maxWidth: 520, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0 80px' }}>
        {firstMedia ? (
          isVideo ? (
            <video src={firstMedia} autoPlay muted={paused} playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firstMedia} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )
        ) : (
          <div style={{ padding: '40px 32px', textAlign: 'center', maxWidth: 420 }}>
            <p style={{ fontSize: 26, color: '#fff', lineHeight: 1.35, fontWeight: 600, margin: 0 }}>
              {story.body ?? bubble.business?.name}
            </p>
          </div>
        )}
      </div>

      {/* Caption */}
      {firstMedia && story.body && (
        <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', left: 16, right: 16, padding: '12px 14px', background: 'rgba(0,0,0,0.55)', borderRadius: 12, color: '#fff', fontSize: 14, lineHeight: 1.45, zIndex: 8, textAlign: 'center' }}>
          {story.body}
        </div>
      )}
    </div>
  )
}
