'use client'
import { useEffect, useRef, useState } from 'react'

export default function VideoIntro({ onDone }: { onDone: () => void }) {
  const vidRef    = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'video' | 'caption' | 'text'>('video')
  const firedRef  = useRef(false)

  useEffect(() => {
    // IMMEDIATELY remove intro-pending — overlay is covering the page right now.
    // This makes body visible again, but the overlay sits on top at z-index 9999
    // so the user still only sees the video. Critical: must happen before first paint.
    document.documentElement.classList.remove('intro-pending')

    const vid = vidRef.current
    if (!vid) return

    // Try autoplay — fall back to first click
    const play = () =>
      vid.play().catch(() => {
        const resume = () => {
          vid.play().catch(() => {})
          document.removeEventListener('click', resume)
        }
        document.addEventListener('click', resume, { once: true })
      })

    vid.addEventListener('loadeddata', play, { once: true })
    vid.addEventListener('canplaythrough', play, { once: true })
    play()

    // Hard fallback: if video never plays after 7s, dismiss anyway
    const fallback = setTimeout(dismiss, 7000)

    // Caption: appears during the wave (~0.6s), fades out before the door opens (~5s).
    // The end-headline ('text' phase) is set directly by onTimeUpdate and always wins.
    const captionIn = setTimeout(() => {
      setPhase(p => (p === 'video' ? 'caption' : p))
    }, 600)
    const captionOut = setTimeout(() => {
      setPhase(p => (p === 'caption' ? 'video' : p))
    }, 5000)

    function dismiss() {
      clearTimeout(fallback)
      clearTimeout(captionIn)
      clearTimeout(captionOut)
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
        setPhase('text')
        setTimeout(() => {
          if (vid) { vid.style.transition = 'opacity 0.6s'; vid.style.opacity = '0' }
        }, 400)
        setTimeout(dismiss, 2200)
      }
    }

    vid.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      vid.removeEventListener('timeupdate', onTimeUpdate)
      vid.removeEventListener('loadeddata', play)
      vid.removeEventListener('canplaythrough', play)
      clearTimeout(fallback)
      clearTimeout(captionIn)
      clearTimeout(captionOut)
    }
  }, [onDone])

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
        poster="/videos/aria-intro-poster.jpg"
        src="/videos/aria-intro.mp4"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(6,9,8,0.15) 0%, transparent 10%, transparent 75%, rgba(6,9,8,1) 100%)',
      }} />

      {/* Green door flash */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 85% at 58% 50%, rgba(92,230,168,0.9) 0%, rgba(40,180,110,0.4) 40%, transparent 68%)',
        opacity: phase === 'text' ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }} />

      {/* Intro caption — readable since there's no audio */}
      <div style={{
        position: 'absolute', zIndex: 3, left: 0, right: 0, bottom: '14%',
        textAlign: 'center', padding: '0 32px',
        opacity: phase === 'caption' ? 1 : 0,
        transform: phase === 'caption' ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        pointerEvents: 'none',
      }}>
        <p style={{
          display: 'inline-block',
          fontFamily: 'var(--font-display, serif)',
          fontWeight: 300,
          fontSize: 'clamp(1.5rem, 3.6vw, 3rem)',
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          color: '#fff',
          margin: 0,
          textShadow: '0 2px 24px rgba(0,0,0,0.55)',
        }}>
          Running a business is hard.{' '}
          <em style={{ color: '#7FB897', fontStyle: 'italic' }}>Meet Aria.</em>
        </p>
      </div>

      {/* Hero text */}
      <div style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        padding: '0 40px',
        opacity: phase === 'text' ? 1 : 0,
        transform: phase === 'text' ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        pointerEvents: 'none',
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
          fontFamily: 'var(--font-body, sans-serif)',
        }}>
          Built for Australian small business
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display, serif)',
          fontWeight: 300,
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
