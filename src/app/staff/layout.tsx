'use client'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DEEP  = '#2D5240'
const MUTED = '#6b7d74'
const LINE  = '#e6ece8'

function BottomNav() {
  const pathname = usePathname()
  const tabs = [
    { href: '/staff/portal',          label: 'Home',     icon: '🏠' },
    { href: '/staff/portal/schedule', label: 'Schedule', icon: '📅' },
    { href: '/staff/portal/training', label: 'Training', icon: '🎓' },
    { href: '/staff/portal/leave',    label: 'Leave',    icon: '🏖️' },
    { href: '/staff/portal/messages', label: 'Inbox',    icon: '✉️' },
  ]
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      display: 'flex',
      background: 'rgba(255,255,255,.92)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      borderTop: '1px solid ' + LINE,
      padding: '9px 8px 14px',
    }}>
      {tabs.map(({ href, label, icon }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 3, textDecoration: 'none',
            fontSize: 10, fontWeight: active ? 600 : 500,
            color: active ? DEEP : MUTED,
          }}>
            <span style={{ fontSize: 19 }}>{icon}</span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export default function StaffPortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  const isPublicPage = pathname === '/staff/login'
    || pathname === '/staff/accept-invite'
    || pathname === '/staff/reset-password'

  useEffect(() => {
    if (isPublicPage) { setChecking(false); return }
    if (!supabase) { router.replace('/staff/login'); return }
    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      const session = result.data.session
      if (!session) router.replace('/staff/login')
      else setChecking(false)
    })
  }, [isPublicPage, router])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    router.replace('/staff/login')
  }

  if (!isPublicPage && checking) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#f4f7f5' }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: '#7FB897', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (isPublicPage) return <>{children}</>

  return (
    <div className="min-h-screen" style={{ background: '#f4f7f5' }}>
      <main className="max-w-2xl mx-auto" style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 24, paddingBottom: 90 }}>
        {children}
        <div style={{ textAlign: 'center', paddingTop: 28, paddingBottom: 4 }}>
          <button onClick={handleSignOut} style={{
            fontSize: 12, color: MUTED, background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Sign out
          </button>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
