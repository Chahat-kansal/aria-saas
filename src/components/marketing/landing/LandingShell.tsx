'use client'
import { useEffect, useRef, useState } from 'react'
import HeroAct from './HeroAct'
import StickyOverlay from './StickyOverlay'
import ProgressBar from './ProgressBar'
import { SCENES } from './scene-data'

export default function LandingShell() {
  const heroRef       = useRef<HTMLDivElement>(null)
  const progressRef   = useRef<HTMLDivElement>(null)
  const currentScene  = useRef(-1)
  const hasScrolledR  = useRef(false)
  const rafId         = useRef<number | null>(null)

  const [activeIdx,   setActiveIdx]   = useState(-1)
  const [counterNum,  setCounterNum]  = useState('01')
  const [hasScrolled, setHasScrolled] = useState(false)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const update = () => {
      const scrollY   = window.scrollY
      const heroEndPx = window.innerHeight * 2
      const docH      = document.documentElement.scrollHeight - window.innerHeight
      const tp        = docH > 0 ? Math.max(0, Math.min(1, scrollY / docH)) : 0

      // Progress bar — direct DOM, no React re-render
      if (progressRef.current) progressRef.current.style.width = (tp * 100) + '%'

      if (scrollY < heroEndPx) {
        // ── HERO ACT ─────────────────────────────────────────────
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
        // ── CROSSFADE ACT ─────────────────────────────────────────
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
  }, [])

  return (
    <div className="landing-v3">
      <StickyOverlay counterNum={counterNum} hasScrolled={hasScrolled} />
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

      <div className="scroll-spacer" aria-hidden="true" />

      {/* SEO content — visible to crawlers, hidden visually */}
      <div style={{ position: 'absolute', left: -9999, opacity: 0, pointerEvents: 'none' }} aria-hidden="false">
        <h1>Aria — The POS that actually thinks</h1>
        <h2>AI agents that run your shop while you serve customers</h2>
        <h2>Five agents. One brain. Yours.</h2>
        <h2>Reorder Agent — Aria just knows when to reorder</h2>
        <h2>Pricing Agent — Match competitors before they take your customers</h2>
        <h2>Ask Aria — Get answers in plain English</h2>
        <h2>Schedule Agent — The roster writes itself</h2>
        <h2>Made in Melbourne for Australian retail</h2>
        <h2>14-day free trial. No card. Cancel anytime.</h2>
      </div>
    </div>
  )
}
