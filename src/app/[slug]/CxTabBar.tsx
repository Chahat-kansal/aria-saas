'use client'

const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

function IconHome({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={color} style={{ display: 'block' }}>
      <path d="M10 2L2 9h2.5v8h4v-4.5h3V17h4V9H18L10 2z"/>
    </svg>
  )
}

function IconFork({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block' }}>
      <path d="M7 2v4a2 2 0 01-2 2 2 2 0 01-2-2V2M5 8v10"/>
      <path d="M14 2c0 0 2 2 2 5s-2 3-2 3v8"/>
    </svg>
  )
}

function IconGift({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <rect x="2" y="8" width="16" height="10" rx="1.5"/>
      <path d="M2 8h16"/>
      <line x1="10" y1="8" x2="10" y2="18"/>
      <path d="M10 8C10 8 8 5 6 5s-2 2-2 3"/>
      <path d="M10 8c0 0 2-3 4-3s2 2 2 3"/>
    </svg>
  )
}

function IconCard({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
      <rect x="2" y="4.5" width="16" height="11" rx="2" stroke={color} strokeWidth="1.5"/>
      <path d="M2 8.5h16" stroke={color} strokeWidth="1.5"/>
      <rect x="4" y="11" width="4" height="2" rx="1" fill={color}/>
    </svg>
  )
}

export type CxActiveTab =
  | 'home' | 'menu' | 'rewards' | 'wallet'
  | 'scan' | 'locations' | 'account' | 'history'
  | 'offers' | 'notifications' | 'search' | 'item'
  | 'onboarding' | 'cart'

export function CxTabBar({ slug, active, cartCount = 0, dark = false }: {
  slug: string
  active: CxActiveTab
  cartCount?: number
  dark?: boolean
}) {
  const tabs = [
    { key: 'home' as const,    label: 'Home',    href: '/' + slug },
    { key: 'menu' as const,    label: 'Menu',    href: '/' + slug + '/menu' },
    { key: 'rewards' as const, label: 'Rewards', href: '/' + slug + '/rewards' },
    { key: 'wallet' as const,  label: 'Wallet',  href: '/' + slug + '/wallet' },
  ]

  const bgColor = dark ? 'rgba(20,19,15,0.92)' : 'rgba(243,239,228,0.9)'
  const inactiveColor = dark ? 'rgba(255,255,255,0.38)' : '#8a8a84'

  return (
    <nav style={{
      position: 'fixed', bottom: 12, zIndex: 1000,
      left: '50%', transform: 'translateX(-50%)',
      width: 358, height: 64, borderRadius: 32,
      backdropFilter: 'blur(16px) saturate(180%)',
      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      background: bgColor,
      boxShadow: dark
        ? '0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset'
        : '0 8px 32px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.7) inset',
      display: 'flex', alignItems: 'stretch', padding: '0 4px',
    }}>
      {tabs.map(t => {
        const on = active === t.key
        const iconColor = on ? ACCENT : inactiveColor
        return (
          <a
            key={t.key}
            href={t.href}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', position: 'relative', gap: 2,
            }}
          >
            {/* Soft lime halo — no solid fill, just glow */}
            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              background: on ? 'rgba(217,245,78,0.14)' : 'transparent',
              boxShadow: on ? '0 0 14px rgba(217,245,78,0.45)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {t.key === 'home'    && <IconHome color={iconColor} />}
              {t.key === 'menu'    && <IconFork color={iconColor} />}
              {t.key === 'rewards' && <IconGift color={iconColor} />}
              {t.key === 'wallet'  && <IconCard color={iconColor} />}
            </div>
            <span style={{ fontFamily: FB, fontSize: 10, fontWeight: on ? 700 : 400, color: on ? ACCENT : inactiveColor, letterSpacing: '0.01em' }}>
              {t.label}
            </span>

            {/* Cart badge — Menu tab only */}
            {t.key === 'menu' && cartCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: '50%',
                transform: 'translateX(16px)',
                minWidth: 16, height: 16, borderRadius: 8,
                background: ACCENT, color: ACCENT_TEXT,
                fontFamily: FB, fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </a>
        )
      })}
    </nav>
  )
}