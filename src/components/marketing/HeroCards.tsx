'use client'
import { useScroll, useTransform, motion } from 'framer-motion'

const rimLight: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0, height: 1,
  background: 'linear-gradient(90deg, transparent, rgba(127,184,151,0.5), transparent)',
  borderRadius: '16px 16px 0 0',
}

const cardBase: React.CSSProperties = {
  position: 'absolute',
  background: 'rgba(19,26,22,0.70)',
  backdropFilter: 'blur(28px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
  borderRadius: 16,
  boxShadow: `
    0 24px 48px rgba(0,0,0,0.45),
    0 8px 24px rgba(0,0,0,0.25)
  `,
  overflow: 'hidden',
}

export function HeroCards() {
  const { scrollY } = useScroll()
  const card1Y = useTransform(scrollY, [0, 800], [0, -110])
  const card2Y = useTransform(scrollY, [0, 800], [0, -60])
  const card3Y = useTransform(scrollY, [0, 800], [0, -28])

  return (
    <div style={{
      position: 'relative',
      width: 420,
      height: 420,
      perspective: '1400px',
      perspectiveOrigin: '50% 30%',
      flexShrink: 0,
    }}>
      {/* Card 1 — Revenue summary (foreground, top-right) */}
      <motion.div
        style={{
          ...cardBase,
          width: 310,
          top: 0,
          right: 0,
          padding: '18px 20px',
          transform: 'perspective(1400px) rotateY(-12deg) rotateX(6deg) translateZ(80px)',
          y: card1Y,
        }}
        whileHover={{ scale: 1.03, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
      >
        <div style={rimLight} />
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>Today&apos;s revenue</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '-0.04em' }}>A$4,218</div>
        <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>↑ 14% vs last Friday</span>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          {[60, 72, 55, 80, 91, 68, 100].map((h, i) => (
            <div key={i} style={{
              flex: 1, height: 32, borderRadius: 3,
              background: `rgba(127,184,151,${h / 100 * 0.7 + 0.1})`,
              position: 'relative',
            }}>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${h}%`, borderRadius: 3, background: 'rgba(127,184,151,0.5)' }} />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Card 2 — Reorder alert (middle) */}
      <motion.div
        style={{
          ...cardBase,
          width: 270,
          top: 185,
          left: 0,
          padding: '14px 18px',
          transform: 'perspective(1400px) rotateY(-8deg) rotateX(-2deg) translateZ(40px)',
          y: card2Y,
        }}
        whileHover={{ scale: 1.03, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
      >
        <div style={rimLight} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: 'var(--gradient-aria)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
          }}>✦</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Aria reordered for you</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Carlton Dry 24-pack × 6 cases<br />
              <span style={{ color: 'var(--text-tertiary)' }}>Sending PO to ALM · est. A$342</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
          Auto-approved · 4 days lead time
        </div>
      </motion.div>

      {/* Card 3 — Ask Aria (background, bottom) */}
      <motion.div
        style={{
          ...cardBase,
          width: 330,
          bottom: 20,
          right: 10,
          padding: '12px 16px',
          transform: 'perspective(1400px) rotateY(-15deg) rotateX(8deg) translateZ(0px)',
          y: card3Y,
        }}
        whileHover={{ scale: 1.02, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
      >
        <div style={rimLight} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1, fontStyle: 'italic' }}>
            &ldquo;Which product made the most profit last month?&rdquo;
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--violet)', fontWeight: 600 }}>Aria: </span>
          Marlborough Sav Blanc 750ml — A$2,847 profit (38% margin)
        </div>
      </motion.div>
    </div>
  )
}

/* Mobile: single static card */
export function HeroMobileCard() {
  return (
    <div style={{
      ...cardBase,
      position: 'relative',
      padding: '16px 18px',
      maxWidth: 340,
      margin: '0 auto',
    }}>
      <div style={rimLight} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: 'var(--gradient-aria)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
        }}>✦</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Aria notified you</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Reorder Carlton Dry × 24<br />
            <span style={{ color: 'var(--success)' }}>Auto-approved at 8am Mon</span>
          </div>
        </div>
      </div>
    </div>
  )
}
