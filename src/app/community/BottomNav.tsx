'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { Home, Film, Store, Search, User, PlusSquare, Bell } from 'lucide-react'
import { PALETTE, BORDER, NAV_SHADOW, RADIUS, FONT, MAX_W } from './theme'

// feed · reels · alerts · [+create] · market · search · profile
const TABS = [
  { href: '/community',              label: 'feed',    icon: Home,   match: (p: string) => p === '/community' },
  { href: '/community/reels',        label: 'reels',   icon: Film,   match: (p: string) => p.startsWith('/community/reels') },
  { href: '/community/notifications', label: 'alerts', icon: Bell,   match: (p: string) => p.startsWith('/community/notifications') },
  { href: '/community/market',       label: 'market',  icon: Store,  match: (p: string) => p.startsWith('/community/market') },
  { href: '/community/search',       label: 'search',  icon: Search, match: (p: string) => p.startsWith('/community/search') },
  { href: '/community/me',           label: 'profile', icon: User,   match: (p: string) => p.startsWith('/community/me') },
]

export function BottomNav() {
  const pathname = usePathname() || '/community'
  // CX-POLISH-1 — unread notification badge on the alerts tab. count_only=true never marks read.
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let active = true
    fetch('/api/community/notifications?count_only=true')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active && d) setUnread(Number(d.unread_count) || 0) })
      .catch(() => {})
    return () => { active = false }
  }, [pathname])

  // Immersive full-screen reel viewer — hide the nav.
  if (pathname.startsWith('/community/reels/') && pathname !== '/community/reels') return null

  const activeIdx = TABS.findIndex(t => t.match(pathname))

  return (
    <div style={{
      position: 'fixed', bottom: 14, left: 14, right: 14, zIndex: 50,
      maxWidth: MAX_W, margin: '0 auto', fontFamily: FONT,
      pointerEvents: 'none',
    }}>
      <nav style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: PALETTE.surface,
        border: BORDER,
        borderRadius: RADIUS.xl,
        padding: 5,
        boxShadow: NAV_SHADOW,
        pointerEvents: 'auto',
      }}>
        {TABS.slice(0, 3).map((t, i) => {
          const active = i === activeIdx
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch={false}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              style={{
                position: 'relative',
                flex: active ? 1.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 44,
                borderRadius: 17,
                textDecoration: 'none',
                color: PALETTE.ink,
                transition: 'flex 240ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {active && (
                <motion.div
                  layoutId="community-nav-indicator"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  style={{ position: 'absolute', inset: 0, background: PALETTE.accent, borderRadius: 17 }}
                />
              )}
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: active ? '9px 13px' : '9px 0' }}>
                <Icon size={active ? 16 : 18} strokeWidth={active ? 2.4 : 2} color={PALETTE.ink} />
                {active && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.ink, letterSpacing: '-0.01em' }}>{t.label}</span>
                )}
              </span>
              {t.href === '/community/notifications' && unread > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 6, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 8, background: PALETTE.live, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )
        })}
        {/* Create post button */}
        <Link href="/community/create" prefetch={false} aria-label="Create post"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 17, textDecoration: 'none', position: 'relative' }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: PALETTE.accent, border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PlusSquare size={17} strokeWidth={2.5} color={PALETTE.ink} />
          </div>
        </Link>
        {TABS.slice(3).map((t, i) => {
          const active = i + 3 === activeIdx
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch={false}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              style={{
                position: 'relative',
                flex: active ? 1.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 44,
                borderRadius: 17,
                textDecoration: 'none',
                color: PALETTE.ink,
                transition: 'flex 240ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {active && (
                <motion.div
                  layoutId="community-nav-indicator"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  style={{ position: 'absolute', inset: 0, background: PALETTE.accent, borderRadius: 17 }}
                />
              )}
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: active ? '9px 13px' : '9px 0' }}>
                <Icon size={active ? 16 : 18} strokeWidth={active ? 2.4 : 2} color={PALETTE.ink} />
                {active && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.ink, letterSpacing: '-0.01em' }}>{t.label}</span>
                )}
              </span>
              {t.href === '/community/notifications' && unread > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 6, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 8, background: PALETTE.live, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
