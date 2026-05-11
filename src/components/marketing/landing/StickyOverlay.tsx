'use client'
import Link from 'next/link'

interface Props {
  counterNum: string
  hasScrolled: boolean
}

export default function StickyOverlay({ counterNum, hasScrolled }: Props) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/login" className="overlay-login">Log in</Link>
          <div className="scene-counter">
            <span className="num">{counterNum}</span>
            <span style={{ opacity: 0.4 }}>/</span>
            <span className="num" style={{ color: 'var(--text-tertiary)' }}>12</span>
          </div>
        </div>
      </header>

      <aside className="overlay-bottom">
        <Link
          href="/login"
          className={`cta-pill login-pill ${hasScrolled ? 'visible' : ''}`}
          style={{ background: 'transparent', border: '1px solid rgba(127,184,151,0.3)', color: 'var(--text-secondary, #9BA8A0)' }}
        >
          <span>Log in</span>
        </Link>
        <Link
          href="/signup?utm_source=landing&utm_medium=sticky_pill&utm_campaign=v3"
          className={`cta-pill ${hasScrolled ? 'visible' : ''}`}
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
