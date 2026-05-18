import type { ReactNode } from 'react'
import Link from 'next/link'

export default function StaffPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page, #0E1411)', color: 'var(--text-primary, #E8EDE7)' }}>
      <nav style={{ background: 'var(--bg-elevated, #1A2620)', borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))', padding: '12px 16px' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium italic" style={{ color: 'var(--accent, #7FB897)' }}>Aria</span>
            <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Staff Portal</span>
          </div>
          <div className="flex gap-1">
            {[
              { href: '/staff/portal', label: 'Home' },
              { href: '/staff/portal/schedule', label: 'Schedule' },
              { href: '/staff/portal/timesheets', label: 'Hours' },
              { href: '/staff/portal/leave', label: 'Leave' },
              { href: '/staff/portal/availability', label: 'Availability' },
            ].map(item => (
              <Link key={item.href} href={item.href}
                className="px-2.5 py-1.5 text-xs rounded transition-colors hover:text-white"
                style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
