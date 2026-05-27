'use client'
import { useEffect, useRef, ReactNode } from 'react'

/**
 * ScrollPinHero — reusable scroll-pinned hero.
 *
 * The hero is pinned (position: fixed visually) and fades out as the user scrolls.
 * A scroll progress bar sits at the top. Arrow / PageUp / PageDown / Home / End navigate.
 * prefers-reduced-motion disables the fade — the hero is immediately scrolled past.
 *
 * Usage:
 *   <ScrollPinHero hero={<MyHero />}>
 *     {/* normal page sections follow *\/}
 *   </ScrollPinHero>
 */
export default function ScrollPinHero({
  hero,
  children,
  pinViewports = 1.4,
}: {
  hero: ReactNode
  children: ReactNode
  /** how many viewport heights the hero remains pinned for (default 1.4) */
  pinViewports?: number
}) {
  const heroRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  const rafId = useRef<number | null>(null)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const update = () => {
      const scrollY = window.scrollY
      const heroEndPx = window.innerHeight * pinViewports
      const docH = document.documentElement.scrollHeight - window.innerHeight
      const tp = docH > 0 ? Math.max(0, Math.min(1, scrollY / docH)) : 0

      if (progressRef.current) progressRef.current.style.width = (tp * 100) + '%'

      if (heroRef.current) {
        if (reducedMotion) {
          heroRef.current.style.setProperty('--hero-progress', '1')
          heroRef.current.style.opacity = scrollY > 40 ? '0' : '1'
          heroRef.current.style.visibility = scrollY > heroEndPx ? 'hidden' : 'visible'
        } else if (scrollY < heroEndPx) {
          const hp = Math.max(0, Math.min(1, scrollY / heroEndPx))
          heroRef.current.style.setProperty('--hero-progress', String(hp))
          heroRef.current.style.opacity = String(1 - hp * 0.95)
          heroRef.current.style.visibility = 'visible'
          heroRef.current.style.transform = `translateY(${-hp * 40}px) scale(${1 - hp * 0.04})`
        } else {
          heroRef.current.style.setProperty('--hero-progress', '1')
          heroRef.current.style.opacity = '0'
          heroRef.current.style.visibility = 'hidden'
        }
      }

      rafId.current = null
    }

    const onScroll = () => {
      if (rafId.current === null) rafId.current = requestAnimationFrame(update)
    }

    const onKey = (e: KeyboardEvent) => {
      const step = window.innerHeight
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); window.scrollBy({ top: step, behavior: 'smooth' }) }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); window.scrollBy({ top: -step, behavior: 'smooth' }) }
      else if (e.key === 'Home') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
      else if (e.key === 'End') { e.preventDefault(); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }) }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    window.addEventListener('keydown', onKey)
    update()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('keydown', onKey)
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [pinViewports])

  return (
    <>
      {/* Scroll progress bar */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 60,
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        <div
          ref={progressRef}
          style={{ height: '100%', width: '0%', background: '#7FB897', transition: 'width 60ms linear' }}
        />
      </div>

      {/* Pinned hero — fixed, fades on scroll */}
      <div
        ref={heroRef}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: '100vh', zIndex: 5,
          willChange: 'opacity, transform',
          transition: 'opacity 80ms linear',
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>
          {hero}
        </div>
      </div>

      {/* Spacer — gives the pinned hero its scroll runway */}
      <div ref={spacerRef} aria-hidden="true" style={{ height: `${pinViewports * 100}vh` }} />

      {/* Content sits below the spacer, scrolls normally over a higher z-index */}
      <div style={{ position: 'relative', zIndex: 10, background: 'transparent' }}>
        {children}
      </div>
    </>
  )
}
