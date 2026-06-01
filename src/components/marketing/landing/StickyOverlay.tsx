'use client'
import React from 'react'
import Link from 'next/link'

interface Props {
  hasScrolled: boolean
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
            } catch {}
          }}
        >
          <span>Start free trial</span>
          <span className="arrow">→</span>
        </Link>
      </aside>
    </>
  )
}
