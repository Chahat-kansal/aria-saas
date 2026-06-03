'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * VideoIntro — fullscreen video overlay that plays once on first visit,
 * then fades away to reveal the real landing page underneath.
 *
 * Sequence:
 *  0.0s  video starts playing fullscreen
 *  ~4.1s (0.9s before end) — green door flash fires
 *  ~4.4s — hero text animates in big over the green light
 *  ~4.8s — video fades out, text holds
 *  ~5.8s — text fades, entire overlay removes itself → real landing page visible
 *
 * The overlay is skipped on return visits (sessionStorage flag).
 */
export default function VideoIntro({ onDone }: { onDone: () => void }) {
  const vidRef   = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'video' | 'text' | 'done'>('video')
  const firedRef = useRef(false)

  useEffect(() => {
    const vid = vidRef.current
    if (!vid) return

    // Try autoplay; fall back to click
    const play = () => vid.play().catch(() => {
      const resume = () => { vid.play().catch(() => {}); document.removeEventListener('click', resume) }
      document.addEventListener('click', resume, { once: true })
    })
    vid.addEventListener('loadeddata', play, { once: true })
    vid.addEventListener('canplaythrough', play, { once: true })
    play()

    // Fallback: if video never fires, skip after 7s
    const fallback = setTimeout(() => dismiss(), 7000)

    function dismiss() {
      clearTimeout(fallback)
      // fade overlay out then call onDone
      const el = overlayRef.current
      if (!el) { onDone(); return }
      el.style.transition = 'opacity 0.7s ease'
      el.style.opacity = '0'
      setTimeout(onDone, 750)
    }

    const onTimeUpdate = () => {
      if (!vid.duration || firedRef.current) return
      const rem = vid.duration - vid.currentTime

      if (rem < 0.9) {
        firedRef.current = true
        clearTimeout(fallback)

        // 1. Text phase — hero copy animates in big
        setPhase('text')

        // 2. Video fades at 400ms
        setTimeout(() => {
          if (vid) { vid.style.transition = 'opacity 0.6s'; vid.style.opacity = '0' }
        }, 400)

        // 3. Dismiss overlay at 2.2s — reveal real landing page
        setTimeout(dismiss, 2200)
      }
    }

    vid.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      vid.removeEventListener('timeupdate', onTimeUpdate)
      vid.removeEventListener('loadeddata', play)
      vid.removeEventListener('canplaythrough', play)
      clearTimeout(fallback)
    }
  }, [onDone])

  if (phase === 'done') return null

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#060908',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Fullscreen video */}
      <video
        ref={vidRef}
        muted
        playsInline
        preload="auto"
        src="/videos/aria-intro.mp4"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(6,9,8,0.15) 0%, transparent 10%, transparent 75%, rgba(6,9,8,1) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Green door flash */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 85% at 58% 50%, rgba(92,230,168,0.9) 0%, rgba(40,180,110,0.4) 40%, transparent 68%)',
        opacity: phase === 'text' ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }} />

      {/* Hero text — the same copy from the real landing page, shown big */}
      <div style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        padding: '0 40px',
        opacity: phase === 'text' ? 1 : 0,
        transform: phase === 'text' ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>
        <div style={{
          display: 'inline-block',
          fontSize: 'clamp(0.65rem, 1.2vw, 0.78rem)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '100px',
          padding: '6px 18px',
          marginBottom: '24px',
          fontFamily: 'var(--font-geist, Geist, sans-serif)',
        }}>
          Built for Australian small business
        </div>
        <h1 style={{
          fontFamily: 'var(--font-fraunces, Fraunces, serif)',
          fontWeight: 200,
          fontSize: 'clamp(2.8rem, 7vw, 7rem)',
          letterSpacing: '-0.04em',
          lineHeight: 1.0,
          color: '#fff',
          margin: 0,
        }}>
          Your AI co-owner.
          <br />
          <em style={{ color: '#7FB897', fontStyle: 'italic' }}>Running the back office.</em>
        </h1>
      </div>
    </div>
  )
}
