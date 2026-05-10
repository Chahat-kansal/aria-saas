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
        <div className="scene-counter">
          <span className="num">{counterNum}</span>
          <span style={{ opacity: 0.4 }}>/</span>
          <span className="num" style={{ color: 'var(--text-tertiary)' }}>12</span>
        </div>
      </header>

      <aside className="overlay-bottom">
        <Link
          href="/signup?utm_source=landing&utm_medium=sticky_pill&utm_campaign=v3"
          className={`cta-pill ${hasScrolled ? 'visible' : ''}`}
          onClick={() => {
            try {
              // analytics optional — imported elsewhere
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
