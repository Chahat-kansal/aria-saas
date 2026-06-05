'use client'
import { useEffect, useRef, useState } from 'react'

export default function VideoIntro({ onDone }: { onDone: () => void }) {
  const vidRef    = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'video' | 'caption' | 'text'>('video')
  const [captionStep, setCaptionStep] = useState(0) // 0 hidden, 1 "hard", 2 "Meet Aria", 3 fading
  const [vidPlaying, setVidPlaying] = useState(false)
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

    // Stuck-face fix: only reveal the video once it's ACTUALLY playing (not the frozen
    // poster). Until then we show a gentle pulsing poster so it never looks broken.
    const onPlaying = () => setVidPlaying(true)
    vid.addEventListener('playing', onPlaying)

    // Hard fallback: only if the video never plays at all. Longer than the 10s clip.
    const fallback = setTimeout(dismiss, 14000)

    function dismiss() {
      clearTimeout(fallback)
      const el = overlayRef.current
      if (!el) { onDone(); return }
      el.style.transition = 'opacity 0.7s ease'
      el.style.opacity = '0'
      setTimeout(onDone, 750)
    }

    // Captions are driven by the video's ACTUAL playback time (currentTime), not by
    // mount timers — so on a slow load they never run ahead of a frozen frame.
    // Video beats (10s clip):  0-4s wave · 4-7s walk · 7-9.5s reach+open · 9.5-10s green flood
    //   caption 1 "pain"        @ ~1.0s
    //   caption 2 "empathy"     @ ~3.0s
    //   caption 3 "Aria helps"  @ ~4.8s  (lands during the walk)
    //   captions clear          @ ~6.8s  (before he opens the door — door sequence plays clean)
    const onTimeUpdate = () => {
      if (!vid.duration) return
      const t = vid.currentTime

      // staged captions
      if (t >= 1.0 && t < 6.8) {
        setPhase(p => (p === 'video' ? 'caption' : p))
        if (t >= 4.8) setCaptionStep(s => (s < 3 ? 3 : s))
        else if (t >= 3.0) setCaptionStep(s => (s < 2 ? 2 : s))
        else setCaptionStep(s => (s < 1 ? 1 : s))
      } else if (t >= 6.8 && !firedRef.current) {
        setPhase(p => (p === 'caption' ? 'video' : p))
        setCaptionStep(0)
      }

      // end hand-off: wait until the green flood truly fills the frame (final ~0.25s)
      if (!firedRef.current) {
        const rem = vid.duration - t
        if (rem < 0.25) {
          firedRef.current = true
          clearTimeout(fallback)
          setPhase('text')
          setCaptionStep(0)
          setTimeout(() => {
            if (vid) { vid.style.transition = 'opacity 0.6s'; vid.style.opacity = '0' }
          }, 400)
          setTimeout(dismiss, 2200)
        }
      }
    }

    vid.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      vid.removeEventListener('timeupdate', onTimeUpdate)
      vid.removeEventListener('loadeddata', play)
      vid.removeEventListener('canplaythrough', play)
      vid.removeEventListener('playing', onPlaying)
      clearTimeout(fallback)
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
      {/* Fullscreen video — fades in once it's actually playing (not the frozen poster) */}
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
          objectPosition: 'center 38%',
          opacity: vidPlaying ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      />

      {/* Pulsing poster — shown only until the video actually starts, so a slow load
          looks like a calm breathing image instead of a stuck/broken frame */}
      {!vidPlaying && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/videos/aria-intro-poster.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 38%',
          backgroundRepeat: 'no-repeat',
          animation: 'ariaIntroPulse 2s ease-in-out infinite',
        }} />
      )}

      <style>{`@keyframes ariaIntroPulse { 0%,100% { opacity: 0.78 } 50% { opacity: 1 } }`}</style>

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

      {/* Intro caption — three-beat empathy arc (no audio, so it carries the message) */}
      <div style={{
        position: 'absolute', zIndex: 3, left: 0, right: 0, bottom: '13%',
        textAlign: 'center', padding: '0 32px',
        opacity: phase === 'caption' && captionStep > 0 ? 1 : 0,
        transition: 'opacity 0.7s ease',
        pointerEvents: 'none',
      }}>
        {/* Beat 1 — the pain */}
        <div style={{
          fontFamily: 'var(--font-body, sans-serif)',
          fontWeight: 400,
          fontSize: 'clamp(0.95rem, 2vw, 1.4rem)',
          letterSpacing: '0.01em',
          color: 'rgba(255,255,255,0.82)',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)',
          opacity: captionStep >= 1 ? (captionStep >= 3 ? 0.35 : 1) : 0,
          transform: captionStep >= 1 ? 'translateY(0)' : 'translateY(14px)',
          transition: 'opacity 0.7s ease, transform 0.7s cubic-bezier(.2,.7,.2,1)',
          marginBottom: 'clamp(4px, 0.8vh, 10px)',
        }}>
          Running a business is hard.
        </div>
        {/* Beat 2 — the empathy */}
        <div style={{
          fontFamily: 'var(--font-body, sans-serif)',
          fontWeight: 400,
          fontSize: 'clamp(0.95rem, 2vw, 1.4rem)',
          letterSpacing: '0.01em',
          color: 'rgba(255,255,255,0.82)',
          textShadow: '0 2px 20px rgba(0,0,0,0.6)',
          opacity: captionStep >= 2 ? (captionStep >= 3 ? 0.35 : 1) : 0,
          transform: captionStep >= 2 ? 'translateY(0)' : 'translateY(14px)',
          transition: 'opacity 0.7s ease, transform 0.7s cubic-bezier(.2,.7,.2,1)',
          marginBottom: 'clamp(10px, 1.6vh, 18px)',
        }}>
          We understand the pain.
        </div>
        {/* Beat 3 — the reassurance + reveal */}
        <div style={{
          fontFamily: 'var(--font-display, serif)',
          fontWeight: 300,
          fontSize: 'clamp(2.1rem, 5.4vw, 4.6rem)',
          letterSpacing: '-0.03em',
          lineHeight: 1.04,
          color: '#fff',
          opacity: captionStep >= 3 ? 1 : 0,
          transform: captionStep >= 3 ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.94)',
          transition: 'opacity 0.6s ease, transform 0.7s cubic-bezier(.16,.84,.3,1)',
          textShadow: '0 4px 40px rgba(0,0,0,0.5)',
        }}>
          <em style={{
            color: '#7FB897',
            fontStyle: 'italic',
            textShadow: captionStep >= 3 ? '0 0 36px rgba(127,184,151,0.65)' : 'none',
            transition: 'text-shadow 0.9s ease 0.2s',
          }}>Aria</em>{' '}is here to help.
        </div>
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
