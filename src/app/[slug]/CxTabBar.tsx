'use client'
import { useState } from 'react'

const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

// ── Main nav icons ────────────────────────────────────────────────────────────

function IconHome({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={color} style={{ display: 'block' }}>
      <path d="M10 2L2 9h2.5v8h4v-4.5h3V17h4V9H18L10 2z"/>
    </svg>
  )
}

function IconMenu({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block' }}>
      <path d="M3 5h14M3 10h14M3 15h14"/>
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
      <circle cx="4.5" cy="10" r="1.6"/>
      <circle cx="10" cy="10" r="1.6"/>
      <circle cx="15.5" cy="10" r="1.6"/>
    </svg>
  )
}

// ── More overlay icons ────────────────────────────────────────────────────────

function IconPin({ color = INK }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M11 2C7.686 2 5 4.686 5 8c0 5 6 12 6 12s6-7 6-12c0-3.314-2.686-6-6-6z"/>
      <circle cx="11" cy="8" r="2"/>
    </svg>
  )
}

function IconUser({ color = INK }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <circle cx="11" cy="7" r="4"/>
      <path d="M3 20c0-4.418 3.582-7 8-7s8 2.582 8 7"/>
    </svg>
  )
}

function IconHistory({ color = INK }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M11 4a7 7 0 1 0 7 7"/>
      <polyline points="11 4 11 11 7 14"/>
      <path d="M19 3v5h-5"/>
    </svg>
  )
}

function IconTag({ color = INK }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M4 4h7l7 7-7 7-7-7z"/>
      <circle cx="7.5" cy="7.5" r="1.5" fill={color} stroke="none"/>
    </svg>
  )
}

function IconBell({ color = INK }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <path d="M11 2a7 7 0 0 0-7 7v3l-2 2v1h18v-1l-2-2V9a7 7 0 0 0-7-7z"/>
      <path d="M9.5 18a2 2 0 0 0 3 0"/>
    </svg>
  )
}

function IconSearchMore({ color = INK }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block' }}>
      <circle cx="10" cy="10" r="7"/>
      <path d="M15.5 15.5L20 20"/>
    </svg>
  )
}

// BOOKINGS-CX-BUILD-1
function IconCalendar({ color = INK }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <rect x="3" y="4" width="16" height="15" rx="2"/>
      <path d="M3 9h16M7 2v4M15 2v4"/>
    </svg>
  )
}

// ── Types + constants ─────────────────────────────────────────────────────────

export type CxActiveTab =
  | 'home' | 'menu' | 'rewards' | 'wallet'
  | 'scan' | 'locations' | 'account' | 'history'
  | 'offers' | 'notifications' | 'search' | 'item'
  | 'onboarding' | 'cart' | 'booking'

const MORE_TAB_KEYS: readonly string[] = [
  'locations', 'account', 'history', 'offers', 'notifications', 'search', 'scan', 'item', 'booking',
]

const MORE_ITEMS = [
  { key: 'booking',       label: 'Book a table',  Icon: IconCalendar    },
  { key: 'locations',     label: 'Locations',     Icon: IconPin         },
  { key: 'account',       label: 'Account',       Icon: IconUser        },
  { key: 'history',       label: 'History',       Icon: IconHistory     },
  { key: 'offers',        label: 'Offers',        Icon: IconTag         },
  { key: 'notifications', label: 'Notifications', Icon: IconBell        },
  { key: 'search',        label: 'Search',        Icon: IconSearchMore  },
]

// ── More overlay panel ────────────────────────────────────────────────────────

function MoreOverlay({ slug, onClose }: { slug: string; onClose: () => void }) {
  return (
    <>
      {/* Tap-outside scrim */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
      />
      {/* Panel — floats just above nav pill */}
      <div style={{
        position: 'fixed', bottom: 88, left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100vw - 32px)', maxWidth: '28rem',
        zIndex: 999,
        background: 'rgba(243,239,228,0.97)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 24,
        boxShadow: '0 -4px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
        padding: '18px 16px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {MORE_ITEMS.map(({ key, label, Icon }) => (
            <a
              key={key}
              href={'/' + slug + '/' + key}
              onClick={onClose}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                padding: '14px 8px',
                background: '#fff', borderRadius: 16,
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <Icon color={INK} />
              <span style={{ fontFamily: FB, fontSize: 11, fontWeight: 500, color: INK, textAlign: 'center', lineHeight: 1.3 }}>
                {label}
              </span>
            </a>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

export function CxTabBar({ slug, active, cartCount = 0, dark = false }: {
  slug: string
  active: CxActiveTab
  cartCount?: number
  dark?: boolean
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = MORE_TAB_KEYS.includes(active)

  const tabs = [
    { key: 'home' as const,    label: 'Home',    href: '/' + slug },
    { key: 'menu' as const,    label: 'Menu',    href: '/' + slug + '/menu' },
    { key: 'rewards' as const, label: 'Rewards', href: '/' + slug + '/rewards' },
    { key: 'wallet' as const,  label: 'Wallet',  href: '/' + slug + '/wallet' },
  ]

  const bgColor = dark ? 'rgba(20,19,15,0.92)' : 'rgba(243,239,228,0.9)'
  const inactiveColor = dark ? 'rgba(255,255,255,0.38)' : '#8a8a84'

  return (
    <>
      {moreOpen && <MoreOverlay slug={slug} onClose={() => setMoreOpen(false)} />}

      <nav style={{
        position: 'fixed', bottom: 12, zIndex: 1000,
        left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100vw - 32px)', maxWidth: '28rem',
        height: 64, borderRadius: 32,
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
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: on ? 'rgba(217,245,78,0.14)' : 'transparent',
                boxShadow: on ? '0 0 14px rgba(217,245,78,0.45)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {t.key === 'home'    && <IconHome color={iconColor} />}
                {t.key === 'menu'    && <IconMenu color={iconColor} />}
                {t.key === 'rewards' && <IconGift color={iconColor} />}
                {t.key === 'wallet'  && <IconCard color={iconColor} />}
              </div>
              <span style={{ fontFamily: FB, fontSize: 10, fontWeight: on ? 700 : 400, color: on ? ACCENT : inactiveColor, letterSpacing: '0.01em' }}>
                {t.label}
              </span>

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

        {/* More button — 5th tab */}
        <button
          onClick={() => setMoreOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            gap: 2, padding: 0,
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: (moreActive || moreOpen) ? 'rgba(217,245,78,0.14)' : 'transparent',
            boxShadow: (moreActive || moreOpen) ? '0 0 14px rgba(217,245,78,0.45)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconMore color={(moreActive || moreOpen) ? ACCENT : inactiveColor} />
          </div>
          <span style={{ fontFamily: FB, fontSize: 10, fontWeight: (moreActive || moreOpen) ? 700 : 400, color: (moreActive || moreOpen) ? ACCENT : inactiveColor, letterSpacing: '0.01em' }}>
            More
          </span>
        </button>
      </nav>
    </>
  )
}