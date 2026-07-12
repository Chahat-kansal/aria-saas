'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import HeroAct from './HeroAct'
import StickyOverlay from './StickyOverlay'
import ProgressBar from './ProgressBar'
import { SCENES } from './scene-data'
import HydrationBeacon from '@/components/HydrationBeacon'

const VideoIntro = dynamic(() => import('./VideoIntro'), { ssr: false })

const HERO_VIEWPORTS = 2

export default function LandingShell() {
  const heroRef      = useRef<HTMLDivElement>(null)
  const progressRef  = useRef<HTMLDivElement>(null)
  const currentScene = useRef(-1)
  const hasScrolledR = useRef(false)
  const rafId        = useRef<number | null>(null)

  const [activeIdx,   setActiveIdx]   = useState(-1)
  const [counterNum,  setCounterNum]  = useState('01')
  const [hasScrolled, setHasScrolled] = useState(false)

  // Show video intro on first visit only (skip if sessionStorage flag set)
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return false
    // Skip on return visits within the same session
    if (sessionStorage.getItem('aria_intro_seen')) return false
    return true
  })

  const handleIntroDone = () => {
    sessionStorage.setItem('aria_intro_seen', '1')
    setShowIntro(false)
  }

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Cache a STABLE viewport height. On mobile the address bar shows/hides during
    // scroll, which changes window.innerHeight continuously and shifts every scene
    // boundary mid-scroll (causing pages to skip/jump). We lock the height and only
    // recompute on a real resize/orientation change, not on every scroll frame.
    let vh = window.innerHeight
    const recomputeVh = () => { vh = window.innerHeight }

    const update = () => {
      const scrollY   = window.scrollY
      const heroEndPx = vh * HERO_VIEWPORTS
      const docH      = document.documentElement.scrollHeight - vh
      const tp        = docH > 0 ? Math.max(0, Math.min(1, scrollY / docH)) : 0

      if (progressRef.current) progressRef.current.style.width = (tp * 100) + '%'

      if (scrollY < heroEndPx) {
        const hp = reducedMotion ? 1 : Math.max(0, Math.min(1, scrollY / heroEndPx))
        if (heroRef.current) {
          heroRef.current.style.setProperty('--hero-progress', String(hp))
          heroRef.current.style.opacity = '1'
          heroRef.current.style.visibility = 'visible'
        }
        if (currentScene.current !== -1) {
          currentScene.current = -1
          setActiveIdx(-1)
          setCounterNum('01')
        }
      } else {
        if (heroRef.current) {
          heroRef.current.style.setProperty('--hero-progress', '1')
          heroRef.current.style.opacity = '0'
          heroRef.current.style.visibility = 'hidden'
        }
        const sceneProgress = (scrollY - heroEndPx) / Math.max(1, docH - heroEndPx)
        let idx = Math.floor(sceneProgress * SCENES.length)
        if (idx >= SCENES.length) idx = SCENES.length - 1
        if (idx < 0) idx = 0

        if (idx !== currentScene.current) {
          currentScene.current = idx
          setActiveIdx(idx)
          setCounterNum(SCENES[idx].id)
        }
      }

      if (!hasScrolledR.current && scrollY > 80) {
        hasScrolledR.current = true
        setHasScrolled(true)
      }

      rafId.current = null
    }

    const onScroll = () => {
      if (rafId.current === null) rafId.current = requestAnimationFrame(update)
    }

    const onResize = () => {
      recomputeVh()
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
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('keydown', onKey)
    update()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [])

  const spacerHeight = `${(SCENES.length + HERO_VIEWPORTS) * 100}vh`

  return (
    <div className="landing-v3">
      {/* MONITOR-1 — fires only once THIS component (the landing page's real
          content chunk, loaded via dynamic(ssr:false)) has actually mounted. */}
      <HydrationBeacon path="/" />
      {/* Video intro overlay — renders above everything, removes itself when done */}
      {showIntro && <VideoIntro onDone={handleIntroDone} />}

      <StickyOverlay hasScrolled={hasScrolled} />
      <ProgressBar ref={progressRef} />

      <div className="viewport">
        <HeroAct ref={heroRef} />

        {SCENES.map((scene, i) => {
          const Comp = scene.Component
          return (
            <section
              key={scene.id}
              className={`scene ${scene.className}${i === activeIdx ? ' active' : ''}`}
              data-scene={scene.id}
            >
              <div className="scene-inner">
                <Comp />
              </div>
            </section>
          )
        })}
      </div>

      <div className="scroll-spacer" aria-hidden="true" style={{ height: spacerHeight }} />

      <div style={{ position: 'absolute', left: -9999, opacity: 0, pointerEvents: 'none' }} aria-hidden="false">
        <h1>Aria — the AI business operating system for Australian small business</h1>
        <h2>Running a small business is hard — your current tools make it harder</h2>
        <h2>One AI that knows your entire business</h2>
        <h2>Up and running in 10 minutes</h2>
        <h2>The only POS that gets smarter every day</h2>
        <h2>Built for Australian retail and hospitality</h2>
        <h2>14-day free trial. No card. Cancel anytime.</h2>
      </div>
    </div>
  )
}
