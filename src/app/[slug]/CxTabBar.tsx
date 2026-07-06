'use client'

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

function IconStar({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={color} style={{ display: 'block' }}>
      <path d="M10 2l2.4 4.9L18 7.6l-4 3.9.9 5.5L10 14.4l-4.9 2.6.9-5.5-4-3.9 5.6-.7z"/>
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

export type CxActiveTab = 'home' | 'menu' | 'rewards' | 'wallet'

export function CxTabBar({ slug, active, cartCount = 0 }: { slug: string; active: CxActiveTab; cartCount?: number }) {
  const tabs = [
    { key: 'home' as const,    label: 'Home',    href: '/' + slug },
    { key: 'menu' as const,    label: 'Menu',    href: '/' + slug + '/menu' },
    { key: 'rewards' as const, label: 'Rewards', href: '/' + slug + '/rewards' },
    { key: 'wallet' as const,  label: 'Wallet',  href: '/' + slug + '/wallet' },
  ]

  return (
    <nav style={{
      position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 1000,
      height: 68, borderRadius: 22,
      backdropFilter: 'blur(20px) saturate(200%)',
      WebkitBackdropFilter: 'blur(20px) saturate(200%)',
      background: 'rgba(250,250,250,0.94)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.7) inset',
      display: 'flex', alignItems: 'stretch', padding: '0 6px',
    }}>
      {tabs.map(t => {
        const on = active === t.key
        const iconColor = on ? ACCENT_TEXT : '#aaa'
        return (
          <a
            key={t.key}
            href={t.href}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              textDecoration: 'none', borderRadius: 16,
              background: on ? ACCENT : 'transparent',
              position: 'relative',
            }}
          >
            {t.key === 'home'    && <IconHome color={iconColor} />}
            {t.key === 'menu'    && <IconFork color={iconColor} />}
            {t.key === 'rewards' && <IconStar color={iconColor} />}
            {t.key === 'wallet'  && <IconCard color={iconColor} />}
            <span style={{ fontFamily: FB, fontSize: 10, fontWeight: on ? 700 : 400, color: on ? ACCENT_TEXT : '#aaa', letterSpacing: '0.01em' }}>
              {t.label}
            </span>
            {t.key === 'menu' && cartCount > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: '50%',
                transform: 'translateX(8px)',
                minWidth: 16, height: 16, borderRadius: 8,
                background: '#ef4444', color: '#fff',
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