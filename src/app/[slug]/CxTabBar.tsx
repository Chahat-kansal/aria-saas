'use client'

import { useState } from 'react'

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

function IconMore({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={color} style={{ display: 'block' }}>
      <circle cx="4" cy="10" r="1.5"/>
      <circle cx="10" cy="10" r="1.5"/>
      <circle cx="16" cy="10" r="1.5"/>
    </svg>
  )
}

function IconScan({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block' }}>
      <path d="M2 7V4a2 2 0 012-2h3M2 15v3a2 2 0 002 2h3M15 2h3a2 2 0 012 2v3M15 20h3a2 2 0 002-2v-3"/>
      <line x1="2" y1="11" x2="20" y2="11"/>
    </svg>
  )
}

function IconPin({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M11 2C7.69 2 5 4.69 5 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.31-2.69-6-6-6z"/>
      <circle cx="11" cy="8" r="2"/>
    </svg>
  )
}

function IconUser({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <circle cx="11" cy="7" r="4"/>
      <path d="M2 19c0-4.42 4.03-8 9-8s9 3.58 9 8"/>
    </svg>
  )
}

function IconHistory({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M3 3v6h6"/>
      <path d="M3 9A9 9 0 1011 2"/>
      <path d="M11 6v5l3 3"/>
    </svg>
  )
}

function IconTag({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M20 12.5l-9 9a2 2 0 01-2.83 0l-7.5-7.5A2 2 0 01.5 12V5A4.5 4.5 0 015 .5h7a2 2 0 011.41.59l9 9a2 2 0 010 2.41z"/>
      <circle cx="6" cy="7" r="1"/>
    </svg>
  )
}

function IconBell({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M18 8A7 7 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  )
}

function IconSearch({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block' }}>
      <circle cx="10" cy="10" r="7"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  )
}

export type CxActiveTab =
  | 'home' | 'menu' | 'rewards' | 'wallet'
  | 'scan' | 'locations' | 'account' | 'history'
  | 'offers' | 'notifications' | 'search' | 'item'
  | 'onboarding' | 'cart'

const MORE_TABS: CxActiveTab[] = ['scan', 'locations', 'account', 'history', 'offers', 'notifications', 'search', 'item']

export function CxTabBar({ slug, active, cartCount = 0, dark = false }: {
  slug: string
  active: CxActiveTab
  cartCount?: number
  dark?: boolean
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = (MORE_TABS as string[]).includes(active)

  const tabs = [
    { key: 'home' as const,    label: 'Home',    href: '/' + slug },
    { key: 'menu' as const,    label: 'Menu',    href: '/' + slug + '/menu' },
    { key: 'rewards' as const, label: 'Rewards', href: '/' + slug + '/rewards' },
    { key: 'wallet' as const,  label: 'Wallet',  href: '/' + slug + '/wallet' },
  ]

  const moreItems = [
    { key: 'scan',          label: 'Scan',          href: '/' + slug + '/scan',          icon: IconScan },
    { key: 'locations',     label: 'Locations',     href: '/' + slug + '/locations',     icon: IconPin },
    { key: 'account',       label: 'Account',       href: '/' + slug + '/account',       icon: IconUser },
    { key: 'history',       label: 'History',       href: '/' + slug + '/history',       icon: IconHistory },
    { key: 'offers',        label: 'Offers',        href: '/' + slug + '/offers',        icon: IconTag },
    { key: 'notifications', label: 'Notifications', href: '/' + slug + '/notifications', icon: IconBell },
    { key: 'search',        label: 'Search',        href: '/' + slug + '/search',        icon: IconSearch },
  ]

  const bgColor = dark ? 'rgba(20,19,15,0.92)' : 'rgba(243,239,228,0.9)'
  const inactiveColor = dark ? 'rgba(255,255,255,0.38)' : '#aaa'
  const overlayShadow = dark
    ? '0 -8px 40px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.06) inset'
    : '0 -8px 40px rgba(0,0,0,0.12), 0 1px 0 rgba(255,255,255,0.7) inset'

  return (
    <>
      {/* More overlay */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 90, left: 12, right: 12,
              background: dark ? 'rgba(22,20,16,0.97)' : 'rgba(252,250,245,0.98)',
              borderRadius: 24, padding: '20px 8px 16px',
              boxShadow: overlayShadow,
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: '4px 0',
            }}
          >
            {moreItems.map(item => {
              const on = active === item.key
              const Ic = item.icon
              const col = on ? ACCENT_TEXT : (dark ? 'rgba(255,255,255,0.7)' : INK)
              return (
                <a
                  key={item.key}
                  href={item.href}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 4px', borderRadius: 16, textDecoration: 'none',
                    background: on ? ACCENT : 'transparent',
                  }}
                >
                  <Ic color={col} />
                  <span style={{ fontFamily: FB, fontSize: 11, fontWeight: on ? 700 : 400, color: col }}>
                    {item.label}
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      <nav style={{
        position: 'fixed', bottom: 10, left: 12, right: 12, zIndex: 1000,
        height: 68, borderRadius: 999,
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        background: bgColor,
        boxShadow: dark
          ? '0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset'
          : '0 8px 32px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.7) inset',
        display: 'flex', alignItems: 'stretch', padding: '0 6px',
      }}>
        {tabs.map(t => {
          const on = active === t.key
          const iconColor = on ? INK : inactiveColor
          return (
            <a
              key={t.key}
              href={t.href}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none', position: 'relative',
              }}
            >
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '5px 14px', borderRadius: 999,
                background: on ? ACCENT : 'transparent',
                boxShadow: on ? '0 0 16px rgba(217,245,78,0.5)' : 'none',
              }}>
                {t.key === 'home'    && <IconHome color={iconColor} />}
                {t.key === 'menu'    && <IconFork color={iconColor} />}
                {t.key === 'rewards' && <IconGift color={iconColor} />}
                {t.key === 'wallet'  && <IconCard color={iconColor} />}
                <span style={{ fontFamily: FB, fontSize: 10, fontWeight: on ? 700 : 400, color: on ? INK : inactiveColor, letterSpacing: '0.01em' }}>
                  {t.label}
                </span>
              </div>

              {/* Cart badge — Menu tab only */}
              {t.key === 'menu' && cartCount > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: '50%',
                  transform: 'translateX(16px)',
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

        {/* More tab */}
        <button
          onClick={() => setMoreOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
            padding: 0,
          }}
        >
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '5px 14px', borderRadius: 999,
            background: moreActive || moreOpen ? ACCENT : 'transparent',
            boxShadow: moreActive || moreOpen ? '0 0 16px rgba(217,245,78,0.5)' : 'none',
          }}>
            <IconMore color={moreActive || moreOpen ? INK : inactiveColor} />
            <span style={{ fontFamily: FB, fontSize: 10, fontWeight: moreActive || moreOpen ? 700 : 400, color: moreActive || moreOpen ? INK : inactiveColor, letterSpacing: '0.01em' }}>
              More
            </span>
          </div>
        </button>
      </nav>
    </>
  )
}