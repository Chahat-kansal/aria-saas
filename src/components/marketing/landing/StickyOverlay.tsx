'use client'
import React from 'react'
import Link from 'next/link'

interface Props {
  hasScrolled: boolean
}

// TalkToAriaScene is at SCENES index 13 in a 16-scene array, hero = 2 viewports
function scrollToTalkScene() {
  const vh = window.innerHeight
  const heroEndPx = 2 * vh
  const docH = document.documentElement.scrollHeight - vh
  const target = heroEndPx + (13 / 16) * (docH - heroEndPx)
  window.scrollTo({ top: target, behavior: 'smooth' })
}

export default function StickyOverlay({ hasScrolled }: Props) {
  return (
    <>
      <header className="overlay-top">
        <button
          className="brand-mark"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          Aria
        </button>
        <button
          className={'talk-aria-nav-btn ' + (hasScrolled ? 'visible' : '')}
          onClick={scrollToTalkScene}
          aria-label="Talk to Aria demo"
        >
          Talk to Aria
        </button>
      </header>

      <aside className="overlay-bottom">
        <Link
          href="/login"
          className={'cta-pill login-pill ' + (hasScrolled ? 'visible' : '')}
          style={{ background: 'transparent', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-secondary, #9BA8A0)' }}
        >
          <span>Log in</span>
        </Link>
        <Link
          href="/signup?utm_source=landing&utm_medium=sticky_pill&utm_campaign=v3"
          className={'cta-pill ' + (hasScrolled ? 'visible' : '')}
          onClick={() => {
            try {
              const ev = new CustomEvent('aria-landing-cta', { detail: { source: 'sticky_pill' } })
              window.dispatchEvent(ev)
            } catch (e) { console.error('[silent-catch]', e) }
          }}
        >
          <span>Start free trial</span>
          <span className="arrow">→</span>
        </Link>
      </aside>
    </>
  )
}
