'use client'
import Link from 'next/link'

interface Props {
  eyebrow?: string
  title: string
  subtitle?: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  /** Theme: 'dark' (default) for #0a0a0f, 'deep' for the pricing page #030510 */
  theme?: 'dark' | 'deep'
}

const THEMES = {
  dark: { bg: '#0a0a0f', text: '#fff', dim: 'rgba(255,255,255,0.6)', muted: 'rgba(255,255,255,0.35)', accent: '#7FB897', accentDark: '#2D5240' },
  deep: { bg: '#030510', text: 'rgba(220,240,255,0.95)', dim: 'rgba(130,160,200,0.7)', muted: 'rgba(130,160,200,0.45)', accent: '#8B5CF6', accentDark: '#5b3fc0' },
} as const

/**
 * MarketingPinHero — the visual hero used for ScrollPinHero on every marketing
 * page (pricing, vs/*, etc.). The main landing has its own bespoke hero.
 *
 * The opacity of the aurora glow and scroll cue is wired to --hero-progress
 * (set by ScrollPinHero) so it fades alongside the pinned hero.
 */
export default function MarketingPinHero({ eyebrow, title, subtitle, primaryCta, secondaryCta, theme = 'dark' }: Props) {
  const c = THEMES[theme]
  return (
    <section style={{
      position: 'relative', width: '100%', height: '100%',
      padding: '60px 20px', overflow: 'hidden', background: c.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div aria-hidden="true" style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 720, height: 720,
        background: `radial-gradient(circle, ${c.accent}1f, transparent 70%)`,
        pointerEvents: 'none',
        opacity: 'calc(1 - var(--hero-progress, 0))',
        transition: 'opacity 200ms',
      }} />
      <div style={{ position: 'relative', maxWidth: 800 }}>
        {eyebrow && (
          <p style={{ fontSize: 11, fontWeight: 700, color: c.accent, textTransform: 'uppercase', letterSpacing: '0.16em', margin: '0 0 14px' }}>
            {eyebrow}
          </p>
        )}
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: c.text, margin: 0, marginBottom: 18 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 'clamp(15px, 2vw, 19px)', lineHeight: 1.55, color: c.dim, margin: 0, marginBottom: 28, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
            {subtitle}
          </p>
        )}
        {(primaryCta || secondaryCta) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            {primaryCta && (
              <Link href={primaryCta.href} style={{ padding: '14px 26px', borderRadius: 10, background: c.accent, color: c.bg, textDecoration: 'none', fontSize: 15, fontWeight: 700, boxShadow: `0 8px 24px ${c.accent}40` }}>
                {primaryCta.label}
              </Link>
            )}
            {secondaryCta && (
              <Link href={secondaryCta.href} style={{ padding: '14px 22px', borderRadius: 10, background: 'transparent', border: `1px solid ${c.muted}`, color: c.text, textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>
                {secondaryCta.label}
              </Link>
            )}
          </div>
        )}
      </div>
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)',
        fontSize: 11, color: c.muted, letterSpacing: '0.18em', textTransform: 'uppercase',
        opacity: 'calc(1 - var(--hero-progress, 0))',
        transition: 'opacity 200ms',
      }}>
        Scroll ↓
      </div>
    </section>
  )
}
