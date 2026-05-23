'use client'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function StaffPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  // Skip auth check on login page
  const isLoginPage = pathname === '/staff/login'

  useEffect(() => {
    if (isLoginPage) { setChecking(false); return }
    if (!supabase) { router.replace('/staff/login'); return }
    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      const session = result.data.session
      if (!session) router.replace('/staff/login')
      else setChecking(false)
    })
  }, [isLoginPage, router])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    router.replace('/staff/login')
  }

  if (!isLoginPage && checking) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#0E1411' }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: '#7FB897', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  // Login page renders without nav
  if (isLoginPage) return <>{children}</>

  return (
    <div className="min-h-screen" style={{ background: '#0E1411', color: '#E8EDE7' }}>
      <nav style={{ background: '#1A2620', borderBottom: '1px solid rgba(127,184,151,0.08)', padding: '12px 16px' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium italic" style={{ color: '#7FB897' }}>Aria</span>
            <span className="text-xs" style={{ color: '#A8B5A8' }}>Staff Portal</span>
          </div>
          <div className="flex items-center gap-1">
            {[
              { href: '/staff/portal', label: 'Home' },
              { href: '/staff/portal/schedule', label: 'Schedule' },
              { href: '/staff/portal/timesheets', label: 'Hours' },
              { href: '/staff/portal/leave', label: 'Leave' },
              { href: '/staff/portal/availability', label: 'Availability' },
            ].map(item => (
              <Link key={item.href} href={item.href}
                className="px-2.5 py-1.5 text-xs rounded transition-colors hover:text-white"
                style={{ color: pathname === item.href ? '#7FB897' : '#A8B5A8' }}>
                {item.label}
              </Link>
            ))}
            <button
              onClick={handleSignOut}
              className="px-2.5 py-1.5 text-xs rounded ml-2 transition-colors hover:text-white"
              style={{ color: '#6E7C6E' }}>
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
