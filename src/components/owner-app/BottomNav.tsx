'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { INK, BORDER, FONT_MONO } from '@/app/owner/theme'

const TABS = [
  { key: 'today', label: 'Today', href: '' },
  { key: 'decisions', label: 'Decisions', href: '/decisions' },
  { key: 'jobs', label: 'Jobs', href: '/jobs' },
  { key: 'aria', label: 'Aria', href: '/aria' },
] as const

export function OwnerBottomNav({ slug }: { slug: string }) {
  const pathname = usePathname()
  const base = '/owner/' + slug
  const active = pathname === base ? 'today'
    : pathname?.startsWith(base + '/decisions') ? 'decisions'
    : pathname?.startsWith(base + '/jobs') ? 'jobs'
    : pathname?.startsWith(base + '/aria') ? 'aria'
    : 'today'
  return (
    <div style={{ display: 'flex', borderTop: '1px solid ' + BORDER, background: '#fff' }}>
      {TABS.map(t => {
        const isActive = t.key === active
        return (
          <Link
            key={t.key}
            href={'/owner/' + slug + t.href}
            style={{
              flex: 1, textAlign: 'center', padding: '14px 0', fontSize: 13, fontWeight: 600,
              textDecoration: 'none',
              color: isActive ? '#fff' : INK,
              background: isActive ? INK : 'transparent',
              margin: isActive ? '6px 4px' : '6px 4px',
              borderRadius: 999,
            }}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

export function OwnerHelpButton() {
  return (
    <a
      href="mailto:support@ariaos.site"
      aria-label="Help"
      style={{
        position: 'fixed', bottom: 4, left: '50%', transform: 'translateX(-50%)',
        width: 22, height: 22, borderRadius: '50%', background: '#d9f54e',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: INK,
        textDecoration: 'none', border: '1px solid ' + BORDER,
      }}
    >
      ?
    </a>
  )
}
