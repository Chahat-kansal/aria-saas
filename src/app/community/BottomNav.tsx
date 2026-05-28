'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Film, Store, Bookmark, User } from 'lucide-react'
import { C, MAX_W, FONT } from './theme'

const TABS = [
  { href: '/community',           label: 'Feed',   icon: Home,     match: (p: string) => p === '/community' },
  { href: '/community/reels',     label: 'Reels',  icon: Film,     match: (p: string) => p.startsWith('/community/reels') },
  { href: '/community/market',    label: 'Market', icon: Store,    match: (p: string) => p.startsWith('/community/market') },
  { href: '/community/saved',     label: 'Saved',  icon: Bookmark, match: (p: string) => p.startsWith('/community/saved') },
  { href: '/community/me',        label: 'You',    icon: User,     match: (p: string) => p.startsWith('/community/me') },
]

export function BottomNav() {
  const pathname = usePathname() || '/community'
  // Hide on full-screen reels (immersive)
  if (pathname.startsWith('/community/reels')) return null
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: 'rgba(13,13,20,0.92)',
      backdropFilter: 'saturate(140%) blur(14px)',
      WebkitBackdropFilter: 'saturate(140%) blur(14px)',
      borderTop: `1px solid ${C.border}`,
      fontFamily: FONT,
      paddingBottom: 'env(safe-area-inset-bottom, 0)',
    }}>
      <div style={{ maxWidth: MAX_W, margin: '0 auto', display: 'flex', justifyContent: 'space-around' }}>
        {TABS.map(t => {
          const active = t.match(pathname)
          return (
            <Link key={t.href} href={t.href} prefetch={false} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '10px 0 12px', minHeight: 56,
              color: active ? C.accent : C.textMuted,
              textDecoration: 'none', transition: 'color 160ms',
            }}>
              <t.icon size={22} strokeWidth={active ? 2.2 : 1.7} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.04em' }}>{t.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
